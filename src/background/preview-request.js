import { buildWebhookPreview } from "../core/webhook-plan.js";

export async function previewSelectedProjects({ projects = [], config, origin, api }) {
  if (projects.length === 0) {
    return {
      ok: false,
      error: { code: "NO_PROJECTS_SELECTED", message: "请至少选择一个项目。" }
    };
  }
  if (!origin) {
    return {
      ok: false,
      error: { code: "MISSING_ORIGIN", message: "缺少 GitLab 实例信息，请重新扫描。" }
    };
  }

  await api.fetchCurrentUser(origin);
  const preview = await buildWebhookPreview(projects, config, api, origin);
  return { ...preview, origin };
}
