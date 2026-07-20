import test from "node:test";
import assert from "node:assert/strict";
import { previewSelectedProjects } from "../src/background/preview-request.js";

test("previews exactly the supplied projects after validating the user", async () => {
  const calls = [];
  const api = {
    fetchCurrentUser: async (origin) => calls.push(["user", origin]),
    fetchProjectHooks: async (_origin, projectId) => {
      calls.push(["hooks", projectId]);
      return [];
    }
  };

  const result = await previewSelectedProjects({
    projects: [{ id: 2, path_with_namespace: "oss/two" }],
    config: { url: "https://hooks.example.com/gitlab", events: { comments: true } },
    origin: "https://gitlab.example.com",
    api
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ["user", "https://gitlab.example.com"],
    ["hooks", 2]
  ]);
  assert.deepEqual(result.items.map((item) => item.project.id), [2]);
});

test("rejects an empty project selection", async () => {
  const result = await previewSelectedProjects({
    projects: [], config: {}, origin: "https://gitlab.example.com", api: {}
  });
  assert.deepEqual(result, {
    ok: false,
    error: { code: "NO_PROJECTS_SELECTED", message: "请至少选择一个项目。" }
  });
});

test("rejects a missing origin", async () => {
  const result = await previewSelectedProjects({ projects: [{ id: 1 }], config: {}, origin: "", api: {} });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MISSING_ORIGIN");
});
