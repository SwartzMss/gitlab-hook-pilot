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
    const { group, projects, skippedProjects } = await scanProjects(context, api);

    return { ok: true, data: { context, user, group, projects, skippedProjects } };
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
  if (api.fetchAllUserProjects) {
    const allProjects = await api.fetchAllUserProjects(context.origin);
    const projects = filterWebhookManageableProjects(allProjects);
    return {
      group: {
        name: "当前账号项目",
        full_name: `${context.origin} / 当前账号项目`
      },
      projects,
      skippedProjects: allProjects.length - projects.length
    };
  }

  try {
    const group = await api.fetchGroup(context.origin, context.groupPath);
    const projects = await api.fetchAllGroupProjects(context.origin, context.groupPath);

    return { group, projects, skippedProjects: 0 };
  } catch (error) {
    if (!context.projectPath || error.code !== "NOT_FOUND") throw error;

    const project = await api.fetchProject(context.origin, context.projectPath);
    const isManageable = isWebhookManageableProject(project);
    return {
      group: {
        name: project.namespace?.full_path ?? context.groupPath,
        full_name: project.namespace?.full_path ?? context.groupPath
      },
      projects: isManageable ? [project] : [],
      skippedProjects: isManageable ? 0 : 1
    };
  }
}

export function filterWebhookManageableProjects(projects) {
  return projects.filter(isWebhookManageableProject);
}

export function isWebhookManageableProject(project) {
  return Math.max(
    project?.permissions?.project_access?.access_level ?? 0,
    project?.permissions?.group_access?.access_level ?? 0
  ) >= MIN_WEBHOOK_ACCESS_LEVEL;
}
