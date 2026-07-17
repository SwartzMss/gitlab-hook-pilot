import test from "node:test";
import assert from "node:assert/strict";
import {
  createErrorView,
  createExecutionView,
  createPreviewView,
  createSuccessView
} from "../src/popup/popup-view.js";

test("creates a successful scan view", () => {
  const view = createSuccessView({
    user: { username: "river" },
    group: { full_name: "Platform / Tools" },
    skippedProjects: 2,
    projects: [
      { id: 1, path_with_namespace: "platform/tools/runner", web_url: "https://gitlab.example.com/platform/tools/runner" }
    ]
  });

  assert.equal(view.status, "已使用 river 的权限完成扫描。");
  assert.equal(view.groupName, "Platform / Tools");
  assert.equal(view.projectCount, "共发现 1 个可管理项目");
  assert.deepEqual(view.projects[0], {
    id: 1,
    label: "platform/tools/runner",
    url: "https://gitlab.example.com/platform/tools/runner"
  });
});

test("creates an actionable error view", () => {
  assert.deepEqual(createErrorView({ message: "请重新登录。" }), {
    status: "请重新登录。",
    buttonLabel: "重试"
  });
});

test("creates a webhook preview view", () => {
  const view = createPreviewView({
    summary: {
      totalProjects: 2,
      createProjects: 1,
      updateProjects: 1,
      updateHooks: 2,
      failedProjects: 0
    },
    items: [
      { action: "create", project: { id: 1, name: "Create" }, hookIds: [] },
      { action: "update", project: { id: 2, name: "Update" }, hookIds: [10, 11] }
    ]
  });

  assert.match(view.status, /1 个项目待创建/);
  assert.equal(view.items[1].action, "待更新 2 个");
});

test("creates an execution result view without leaking token fields", () => {
  const view = createExecutionView({
    summary: {
      totalProjects: 1,
      successProjects: 0,
      partialProjects: 1,
      failedProjects: 0
    },
    items: [
      {
        status: "partial_update_success",
        project: { id: 1, name: "Runner" },
        hookResults: [{ ok: false, error: { message: "写入失败" } }]
      }
    ]
  });

  assert.equal(view.items[0].action, "部分更新成功");
  assert.equal(JSON.stringify(view).includes("token"), false);
});
