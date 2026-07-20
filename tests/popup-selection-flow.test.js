import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewRequest,
  invalidatePreviewState,
  validateApplySelection
} from "../src/popup/popup-selection-flow.js";

const projects = [{ id: 1 }, { id: 2 }];

test("builds a preview request from only selected projects", () => {
  assert.deepEqual(buildPreviewRequest(projects, new Set(["2"]), { url: "https://hooks.test" }), {
    ok: true,
    message: {
      type: "PREVIEW_WEBHOOK_CHANGES",
      projects: [{ id: 2 }],
      config: { url: "https://hooks.test" }
    }
  });
});

test("rejects preview when no project is selected", () => {
  assert.deepEqual(buildPreviewRequest(projects, new Set(), {}), {
    ok: false,
    error: "请至少选择一个项目。"
  });
});

test("invalidates preview state", () => {
  assert.deepEqual(invalidatePreviewState({ items: [] }, ["1"]), {
    latestPreview: null,
    latestPreviewProjectIds: [],
    wasPreviewed: true
  });
});

test("rejects apply when the selection differs from preview", () => {
  assert.deepEqual(validateApplySelection(projects, new Set(["1"]), ["1", "2"]), {
    ok: false,
    error: "项目选择已变更，请重新预览。"
  });
  assert.deepEqual(validateApplySelection(projects, new Set(["1", "2"]), ["1", "2"]), {
    ok: true,
    projects
  });
});
