import test from "node:test";
import assert from "node:assert/strict";
import { scanGroupUrl } from "../src/core/scan-group.js";

test("rejects a page outside a GitLab group", async () => {
  const result = await scanGroupUrl("https://gitlab.example.com/users/sign_in", {});

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "NOT_GROUP_PAGE",
      message: "请先打开一个 GitLab Group 页面。"
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
