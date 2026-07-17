import test from "node:test";
import assert from "node:assert/strict";
import { createErrorView, createSuccessView } from "../src/popup/popup-view.js";

test("creates a successful scan view", () => {
  const view = createSuccessView({
    user: { username: "river" },
    group: { full_name: "Platform / Tools" },
    projects: [
      { id: 1, path_with_namespace: "platform/tools/runner", web_url: "https://gitlab.example.com/platform/tools/runner" }
    ]
  });

  assert.equal(view.status, "已使用 river 的权限完成扫描。");
  assert.equal(view.groupName, "Platform / Tools");
  assert.equal(view.projectCount, "共发现 1 个项目");
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
