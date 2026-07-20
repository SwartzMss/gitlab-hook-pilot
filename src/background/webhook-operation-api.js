export function createWebhookOperationApi({
  items = [],
  csrfToken = "",
  fetchImpl = fetch,
  api,
  logOperation
}) {
  const projectNames = new Map(items.map((item) => [
    String(item.project.id),
    item.project.path_with_namespace ?? item.project.name ?? `project-${item.project.id}`
  ]));

  const projectDetails = (projectId) => ({
    project: projectNames.get(String(projectId)) ?? `project-${projectId}`,
    projectId
  });

  return {
    ...api,
    createProjectHook: async (origin, projectId, payload) => {
      const details = { origin, ...projectDetails(projectId), payload: sanitizePayload(payload) };
      logOperation("create hook request", details);
      try {
        const hook = await api.createProjectHook(origin, projectId, payload, fetchImpl, csrfToken);
        logOperation("create hook success", {
          origin, ...projectDetails(projectId), hookId: hook?.id
        });
        return hook;
      } catch (error) {
        logOperation("create hook failed", {
          origin, ...projectDetails(projectId), status: error?.status, error: error?.message ?? "unknown error"
        });
        throw error;
      }
    },
    updateProjectHook: async (origin, projectId, hookId, payload) => {
      const details = {
        origin, ...projectDetails(projectId), hookId, payload: sanitizePayload(payload)
      };
      logOperation("update hook request", details);
      try {
        const hook = await api.updateProjectHook(
          origin, projectId, hookId, payload, fetchImpl, csrfToken
        );
        logOperation("update hook success", {
          origin, ...projectDetails(projectId), hookId: hook?.id ?? hookId
        });
        return hook;
      } catch (error) {
        logOperation("update hook failed", {
          origin,
          ...projectDetails(projectId),
          hookId,
          status: error?.status,
          error: error?.message ?? "unknown error"
        });
        throw error;
      }
    }
  };
}

export function sanitizePayload(payload = {}) {
  return {
    url: payload.url,
    hasToken: Boolean(payload.token),
    events: {
      note_events: payload.note_events,
      merge_requests_events: payload.merge_requests_events,
      push_events: payload.push_events,
      pipeline_events: payload.pipeline_events,
      tag_push_events: payload.tag_push_events,
      issues_events: payload.issues_events
    },
    push_events_branch_filter: payload.push_events_branch_filter,
    branch_filter_strategy: payload.branch_filter_strategy,
    enable_ssl_verification: payload.enable_ssl_verification
  };
}
