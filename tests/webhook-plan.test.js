import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWebhookPreview,
  executeWebhookPlan
} from "../src/core/webhook-plan.js";

const config = {
  url: "https://hooks.example.com/gitlab",
  token: "secret",
  events: { comments: true },
  enableSslVerification: true
};

test("uses exact URL string matching for create and update decisions", async () => {
  const projects = [
    { id: 1, path_with_namespace: "group/create" },
    { id: 2, path_with_namespace: "group/update" },
    { id: 3, path_with_namespace: "group/case-sensitive" }
  ];
  const hooksByProject = new Map([
    [1, [{ id: 10, url: "https://other.example.com/gitlab" }]],
    [2, [{ id: 20, url: "https://hooks.example.com/gitlab" }]],
    [3, [{ id: 30, url: "https://HOOKS.example.com/gitlab" }]]
  ]);

  const preview = await buildWebhookPreview(projects, config, {
    fetchProjectHooks: async (_origin, projectId) => hooksByProject.get(projectId)
  }, "https://gitlab.example.com");

  assert.equal(preview.summary.totalProjects, 3);
  assert.equal(preview.summary.createProjects, 2);
  assert.equal(preview.summary.updateProjects, 1);
  assert.equal(preview.summary.updateHooks, 1);
  assert.deepEqual(preview.items.map((item) => item.action), ["create", "update", "create"]);
});

test("updates every duplicate exact match", async () => {
  const preview = await buildWebhookPreview([
    { id: 1, name: "Runner" }
  ], config, {
    fetchProjectHooks: async () => [
      { id: 10, url: "https://hooks.example.com/gitlab" },
      { id: 11, url: "https://hooks.example.com/gitlab" }
    ]
  }, "https://gitlab.example.com");

  assert.equal(preview.summary.updateProjects, 1);
  assert.equal(preview.summary.updateHooks, 2);
  assert.deepEqual(preview.items[0].hookIds, [10, 11]);
});

test("records hook query failures without adding projects to write queue", async () => {
  const preview = await buildWebhookPreview([
    { id: 1, name: "Runner" }
  ], config, {
    fetchProjectHooks: async () => {
      throw Object.assign(new Error("没有权限"), { code: "FORBIDDEN" });
    }
  }, "https://gitlab.example.com");

  assert.equal(preview.summary.failedProjects, 1);
  assert.equal(preview.items[0].action, "failed");
});

test("executes successful creates and partial duplicate updates independently", async () => {
  const calls = [];
  const result = await executeWebhookPlan([
    { action: "create", project: { id: 1, name: "Create" }, hooks: [] },
    {
      action: "update",
      project: { id: 2, name: "Update" },
      hooks: [
        { id: 20, url: "https://hooks.example.com/gitlab" },
        { id: 21, url: "https://hooks.example.com/gitlab" }
      ]
    }
  ], config, {
    createProjectHook: async (_origin, projectId) => calls.push(["create", projectId]),
    updateProjectHook: async (_origin, projectId, hookId) => {
      calls.push(["update", projectId, hookId]);
      if (hookId === 21) throw Object.assign(new Error("写入失败"), { code: "API_ERROR" });
    }
  }, "https://gitlab.example.com");

  assert.deepEqual(calls, [
    ["create", 1],
    ["update", 2, 20],
    ["update", 2, 21]
  ]);
  assert.equal(result.summary.successProjects, 1);
  assert.equal(result.summary.partialProjects, 1);
  assert.equal(result.summary.failedProjects, 0);
  assert.equal(result.items[1].status, "partial_update_success");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("sends disabled push event fields when creating a hook", async () => {
  let createdPayload;
  const result = await executeWebhookPlan([
    { action: "create", project: { id: 1, name: "Create" }, hooks: [] }
  ], config, {
    createProjectHook: async (_origin, _projectId, payload) => {
      createdPayload = payload;
    },
    updateProjectHook: async () => {}
  }, "https://gitlab.example.com");

  assert.equal(result.summary.successProjects, 1);
  assert.equal(createdPayload.push_events, false);
  assert.equal(createdPayload.push_events_branch_filter, "");
  assert.equal(createdPayload.note_events, true);
  assert.equal(createdPayload.merge_requests_events, false);
});
