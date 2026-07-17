import { parseGitLabGroupUrl } from "./gitlab-context.js";

export async function scanGroupUrl(rawUrl, api) {
  const context = parseGitLabGroupUrl(rawUrl);

  if (!context) {
    return {
      ok: false,
      error: {
        code: "NOT_GROUP_PAGE",
        message: "请先打开一个 GitLab Group 页面。"
      }
    };
  }

  try {
    const [user, group, projects] = await Promise.all([
      api.fetchCurrentUser(context.origin),
      api.fetchGroup(context.origin, context.groupPath),
      api.fetchAllGroupProjects(context.origin, context.groupPath)
    ]);

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
