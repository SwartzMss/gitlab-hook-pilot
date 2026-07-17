import test from "node:test";
import assert from "node:assert/strict";
import {
  filterWebhookManageableProjects,
  isWebhookManageableProject,
  scanGroupUrl
} from "../src/core/scan-group.js";

test("rejects a page outside HTTP GitLab origins", async () => {
  const result = await scanGroupUrl("chrome://extensions", {});

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "NOT_GITLAB_PAGE",
      message: "请先打开一个 GitLab 页面。"
    }
  });
});

test("returns the user, group, and projects for a group page", async () => {
  const api = {
    fetchCurrentUser: async () => ({ username: "river" }),
    fetchGroup: async () => ({ name: "Platform" }),
    fetchAllGroupProjects: async () => [{ id: 1, name: "Runner" }]
  };

  const result = await scanGroupUrl(
    "https://gitlab.example.com/groups/platform/-/activity",
    api
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.context.groupPath, "platform");
  assert.equal(result.data.projects.length, 1);
});

test("falls back to the current project when a project namespace is not a group", async () => {
  const api = {
    fetchCurrentUser: async () => ({ username: "root" }),
    fetchGroup: async () => {
      throw Object.assign(new Error("找不到该 Group"), { code: "NOT_FOUND" });
    },
    fetchAllGroupProjects: async () => {
      throw Object.assign(new Error("找不到该 Group"), { code: "NOT_FOUND" });
    },
    fetchProject: async () => ({
      id: 1,
      name: "test",
      namespace: { full_path: "root" },
      permissions: { project_access: { access_level: 40 } }
    })
  };

  const result = await scanGroupUrl("http://localhost:8929/root/test", api);

  assert.equal(result.ok, true);
  assert.equal(result.data.context.projectPath, "root/test");
  assert.equal(result.data.projects.length, 1);
  assert.equal(result.data.group.full_name, "root");
});

test("scans membership projects from a generic GitLab page", async () => {
  const api = {
    fetchCurrentUser: async () => ({ username: "root" }),
    fetchAllUserProjects: async () => [{
      id: 1,
      name: "test",
      permissions: { project_access: { access_level: 40 } }
    }]
  };

  const result = await scanGroupUrl("http://localhost:8929/dashboard/projects", api);

  assert.equal(result.ok, true);
  assert.equal(result.data.context.scope, "instance");
  assert.equal(result.data.projects.length, 1);
  assert.equal(result.data.group.full_name, "http://localhost:8929 / 当前账号项目");
});

test("scans membership projects from a project hooks page when available", async () => {
  const api = {
    fetchCurrentUser: async () => ({ username: "root" }),
    fetchAllUserProjects: async () => [
      {
        id: 1,
        path_with_namespace: "root/hooo",
        permissions: { project_access: { access_level: 40 } }
      },
      {
        id: 2,
        path_with_namespace: "root/test",
        permissions: { group_access: { access_level: 50 } }
      }
    ],
    fetchGroup: async () => {
      throw new Error("不应该按 Group 扫描");
    },
    fetchProject: async () => {
      throw new Error("不应该只扫描当前项目");
    }
  };

  const result = await scanGroupUrl("http://localhost:8929/root/hooo/-/hooks", api);

  assert.equal(result.ok, true);
  assert.equal(result.data.context.origin, "http://localhost:8929");
  assert.deepEqual(
    result.data.projects.map((project) => project.path_with_namespace),
    ["root/hooo", "root/test"]
  );
});

test("filters out projects below maintainer access", () => {
  const projects = [
    { id: 1, permissions: { project_access: { access_level: 30 } } },
    { id: 2, permissions: { project_access: { access_level: 40 } } },
    { id: 3, permissions: { group_access: { access_level: 50 } } },
    { id: 4, permissions: null }
  ];

  assert.deepEqual(
    filterWebhookManageableProjects(projects).map((project) => project.id),
    [2, 3]
  );
  assert.equal(isWebhookManageableProject(projects[0]), false);
  assert.equal(isWebhookManageableProject(projects[1]), true);
});

test("reports skipped projects below maintainer access", async () => {
  const api = {
    fetchCurrentUser: async () => ({ username: "root" }),
    fetchAllUserProjects: async () => [
      {
        id: 1,
        name: "developer",
        permissions: { project_access: { access_level: 30 } }
      },
      {
        id: 2,
        name: "maintainer",
        permissions: { project_access: { access_level: 40 } }
      }
    ]
  };

  const result = await scanGroupUrl("http://localhost:8929/dashboard/projects", api);

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.projects.map((project) => project.name), ["maintainer"]);
  assert.equal(result.data.skippedProjects, 1);
});

test("normalizes API failures", async () => {
  const api = {
    fetchCurrentUser: async () => {
      throw Object.assign(new Error("没有权限"), { code: "FORBIDDEN" });
    },
    fetchGroup: async () => ({}),
    fetchAllGroupProjects: async () => []
  };

  const result = await scanGroupUrl("https://gitlab.example.com/groups/platform", api);

  assert.deepEqual(result, {
    ok: false,
    error: { code: "FORBIDDEN", message: "没有权限" }
  });
});
