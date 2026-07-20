import test from "node:test";
import assert from "node:assert/strict";
import {
  createProjectIdSnapshot,
  createSelectedProjectIds,
  filterProjects,
  getProjectLabel,
  getSelectedProjects,
  getSelectionState,
  projectIdSnapshotsEqual
} from "../src/popup/project-selection.js";

const projects = [
  { id: 3, path_with_namespace: "oss/storage/s3-client", name: "s3-client" },
  { id: 1, path_with_namespace: "oss/storage/minio-adapter", name: "minio-adapter" },
  { id: 2, name: "Runner" }
];

test("selects all scanned projects by default", () => {
  assert.deepEqual(createSelectedProjectIds(projects), new Set(["3", "1", "2"]));
});

test("returns only selected projects", () => {
  assert.deepEqual(getSelectedProjects(projects, new Set(["1", "3"])).map((p) => p.id), [3, 1]);
});

test("uses a stable full repository label with fallbacks", () => {
  assert.equal(getProjectLabel(projects[0]), "oss/storage/s3-client");
  assert.equal(getProjectLabel({ id: 9, name: "Runner" }), "Runner");
  assert.equal(getProjectLabel({ id: 10 }), "project-10");
});

test("searches repository labels case-insensitively", () => {
  assert.deepEqual(filterProjects(projects, "STORAGE").map((p) => p.id), [3, 1]);
  assert.deepEqual(filterProjects(projects, " runner ").map((p) => p.id), [2]);
});

test("reports checked, indeterminate, and unchecked selection states", () => {
  assert.deepEqual(getSelectionState(new Set(["1", "2", "3"]), 3), {
    checked: true, indeterminate: false, selectedCount: 3, totalCount: 3
  });
  assert.deepEqual(getSelectionState(new Set(["1"]), 3), {
    checked: false, indeterminate: true, selectedCount: 1, totalCount: 3
  });
  assert.deepEqual(getSelectionState(new Set(), 3), {
    checked: false, indeterminate: false, selectedCount: 0, totalCount: 3
  });
});

test("creates and compares stable project snapshots", () => {
  assert.deepEqual(createProjectIdSnapshot(projects.slice(0, 2)), ["1", "3"]);
  assert.equal(projectIdSnapshotsEqual(["1", "3"], ["3", "1"]), true);
  assert.equal(projectIdSnapshotsEqual(["1"], ["1", "3"]), false);
});
