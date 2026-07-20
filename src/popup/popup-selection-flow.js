import {
  createProjectIdSnapshot,
  getSelectedProjects,
  projectIdSnapshotsEqual
} from "./project-selection.js";

export function buildPreviewRequest(projects, selectedProjectIds, config) {
  const selectedProjects = getSelectedProjects(projects, selectedProjectIds);
  if (selectedProjects.length === 0) {
    return { ok: false, error: "请至少选择一个项目。" };
  }
  return {
    ok: true,
    message: { type: "PREVIEW_WEBHOOK_CHANGES", projects: selectedProjects, config }
  };
}

export function invalidatePreviewState(latestPreview, latestPreviewProjectIds) {
  return {
    latestPreview: null,
    latestPreviewProjectIds: [],
    wasPreviewed: Boolean(latestPreview || latestPreviewProjectIds.length)
  };
}

export function isPreviewResponseCurrent(requestProjectIds, projects, selectedProjectIds) {
  const currentIds = createProjectIdSnapshot(getSelectedProjects(projects, selectedProjectIds));
  return projectIdSnapshotsEqual(requestProjectIds, currentIds);
}

export function validateApplySelection(projects, selectedProjectIds, previewProjectIds) {
  const selectedProjects = getSelectedProjects(projects, selectedProjectIds);
  if (selectedProjects.length === 0) return { ok: false, error: "请至少选择一个项目。" };
  const currentIds = createProjectIdSnapshot(selectedProjects);
  if (!projectIdSnapshotsEqual(currentIds, previewProjectIds)) {
    return { ok: false, error: "项目选择已变更，请重新预览。" };
  }
  return { ok: true, projects: selectedProjects };
}
