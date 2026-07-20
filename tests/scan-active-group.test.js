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

test("scans membership projects from a nested group page", async () => {
  const api = {
    fetchCurrentUser: async () => ({ username: "river" }),
    fetchAllUserProjects: async () => [{
      id: 1,
      name: "Runner",
      permissions: { group_access: { access_level: 40 } }
    }],
    fetchGroup: async () => { throw new Error("不应该读取 Group"); },
    fetchAllGroupProjects: async () => { throw new Error("不应该按 Group 扫描"); }
  };

  const result = await scanGroupUrl(
    "https://gitlab.example.com/groups/platform/tools/-/activity",
    api
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.context, {
    origin: "https://gitlab.example.com",
    scope: "instance"
  });
  assert.deepEqual(result.data.projects.map((project) => project.id), [1]);
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
