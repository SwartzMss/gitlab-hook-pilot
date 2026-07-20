import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookOperationApi } from "../src/background/webhook-operation-api.js";

const items = [{
  project: { id: 12345, path_with_namespace: "oxx/yy/so" },
  action: "create"
}];
const payload = {
  url: "https://hooks.example.com/gitlab",
  token: "super-secret-token",
  note_events: true
};

test("logs repository identity for a successful create without exposing token", async () => {
  const logs = [];
  const api = createWebhookOperationApi({
    items,
    csrfToken: "csrf",
    fetchImpl: async () => {},
    api: { createProjectHook: async () => ({ id: 678 }) },
    logOperation: (message, details) => logs.push({ message, details })
  });

  await api.createProjectHook("https://gitlab.example.com", 12345, payload);

  assert.deepEqual(logs.map((entry) => entry.message), ["create hook request", "create hook success"]);
  assert.equal(logs[0].details.project, "oxx/yy/so");
  assert.equal(logs[0].details.projectId, 12345);
  assert.equal(logs[1].details.hookId, 678);
  assert.equal(JSON.stringify(logs).includes("super-secret-token"), false);
});

test("logs repository, hook, status, and error for a failed update", async () => {
  const logs = [];
  const failure = Object.assign(new Error("没有权限"), { status: 403 });
  const api = createWebhookOperationApi({
    items,
    api: { updateProjectHook: async () => { throw failure; } },
    logOperation: (message, details) => logs.push({ message, details })
  });

  await assert.rejects(
    api.updateProjectHook("https://gitlab.example.com", 12345, 20002, payload),
    /没有权限/
  );

  assert.deepEqual(logs.map((entry) => entry.message), ["update hook request", "update hook failed"]);
  assert.equal(logs[1].details.project, "oxx/yy/so");
  assert.equal(logs[1].details.projectId, 12345);
  assert.equal(logs[1].details.hookId, 20002);
  assert.equal(logs[1].details.status, 403);
  assert.equal(logs[1].details.error, "没有权限");
  assert.equal(JSON.stringify(logs).includes("super-secret-token"), false);
});

test("falls back to a stable project label", async () => {
  const logs = [];
  const api = createWebhookOperationApi({
    items: [{ project: { id: 7 }, action: "create" }],
    api: { createProjectHook: async () => ({ id: 8 }) },
    logOperation: (message, details) => logs.push({ message, details })
  });
  await api.createProjectHook("https://gitlab.example.com", 7, payload);
  assert.equal(logs[0].details.project, "project-7");
});

test("logs create failures and update successes with their identifiers", async () => {
  const createLogs = [];
  const createFailure = Object.assign(new Error("禁止创建"), { status: 403 });
  const failingApi = createWebhookOperationApi({
    items,
    api: { createProjectHook: async () => { throw createFailure; } },
    logOperation: (message, details) => createLogs.push({ message, details })
  });
  await assert.rejects(
    failingApi.createProjectHook("https://gitlab.example.com", 12345, payload),
    /禁止创建/
  );
  assert.equal(createLogs[1].message, "create hook failed");
  assert.equal(createLogs[1].details.project, "oxx/yy/so");
  assert.equal(createLogs[1].details.projectId, 12345);
  assert.equal(createLogs[1].details.status, 403);

  const updateLogs = [];
  const successfulApi = createWebhookOperationApi({
    items,
    api: { updateProjectHook: async () => ({ id: 20002 }) },
    logOperation: (message, details) => updateLogs.push({ message, details })
  });
  await successfulApi.updateProjectHook(
    "https://gitlab.example.com", 12345, 20002, payload
  );
  assert.equal(updateLogs[1].message, "update hook success");
  assert.equal(updateLogs[1].details.project, "oxx/yy/so");
  assert.equal(updateLogs[1].details.projectId, 12345);
  assert.equal(updateLogs[1].details.hookId, 20002);
  assert.equal(JSON.stringify([...createLogs, ...updateLogs]).includes("super-secret-token"), false);
});
