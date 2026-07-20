import { parseGitLabGroupUrl } from "./gitlab-context.js";

const MIN_WEBHOOK_ACCESS_LEVEL = 40;

export async function scanGroupUrl(rawUrl, api) {
  const context = parseGitLabGroupUrl(rawUrl);

  if (!context) {
    return {
      ok: false,
      error: {
        code: "NOT_GITLAB_PAGE",
        message: "请先打开一个 GitLab 页面。"
      }
    };
  }

  try {
    const user = await api.fetchCurrentUser(context.origin);
    const { group, projects } = await scanProjects(context, api);

    return { ok: true, data: { context, user, group, projects } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error.code ?? "UNKNOWN_ERROR",
        message: error.message ?? "扫描时发生未知错误。"
      }
    };
  }
}

async function scanProjects(context, api) {
  const projects = await api.fetchAllUserProjects(context.origin, {
    minAccessLevel: MIN_WEBHOOK_ACCESS_LEVEL
  });
  return {
    group: {
      name: "当前账号项目",
      full_name: `${context.origin} / 当前账号项目`
    },
    projects
  };
}

export function filterWebhookManageableProjects(projects) {
  return projects.filter(isWebhookManageableProject);
}

export function isWebhookManageableProject(project) {
  if (!project?.permissions) return false;

  return Math.max(
    project.permissions.project_access?.access_level ?? 0,
    project.permissions.group_access?.access_level ?? 0
  ) >= MIN_WEBHOOK_ACCESS_LEVEL;
}
