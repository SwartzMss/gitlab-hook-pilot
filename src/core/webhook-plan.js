import { buildHookPayload, validateWebhookConfig } from "./webhook-config.js";

const DEFAULT_CONCURRENCY = 5;

export async function buildWebhookPreview(projects, config, api, origin, options = {}) {
  const validation = validateWebhookConfig(config);
  if (!validation.ok) return validation;

  const items = await mapWithConcurrency(projects, options.concurrency ?? DEFAULT_CONCURRENCY, async (project) => {
    try {
      const hooks = await api.fetchProjectHooks(origin, project.id);
      const matches = hooks.filter((hook) => hook.url === validation.config.url);

      if (matches.length === 0) {
        return { action: "create", project, hooks: [], hookIds: [] };
      }

      return {
        action: "update",
        project,
        hooks: matches,
        hookIds: matches.map((hook) => hook.id)
      };
    } catch (error) {
      return {
        action: "failed",
        project,
        hooks: [],
        hookIds: [],
        error: publicError(error, "查询失败")
      };
    }
  });

  return { ok: true, summary: summarizePreview(items), items };
}

export async function executeWebhookPlan(items, config, api, origin, options = {}) {
  const validation = validateWebhookConfig(config);
  if (!validation.ok) return validation;

  const writableItems = items.filter((item) => item.action === "create" || item.action === "update");
  const results = await mapWithConcurrency(
    writableItems,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    (item) => executeProjectItem(item, validation.config, api, origin)
  );

  return { ok: true, summary: summarizeExecution(results), items: results };
}

async function executeProjectItem(item, config, api, origin) {
  if (item.action === "create") {
    try {
      await api.createProjectHook(origin, item.project.id, buildHookPayload(config));
      return { action: "create", project: item.project, status: "create_success" };
    } catch (error) {
      return {
        action: "create",
        project: item.project,
        status: "write_failed",
        error: publicError(error, "写入失败")
      };
    }
  }

  const hookResults = [];
  for (const hook of item.hooks) {
    try {
      await api.updateProjectHook(
        origin,
        item.project.id,
        hook.id,
        buildHookPayload(config, hook)
      );
      hookResults.push({ hookId: hook.id, ok: true });
    } catch (error) {
      hookResults.push({ hookId: hook.id, ok: false, error: publicError(error, "写入失败") });
    }
  }

  const successCount = hookResults.filter((result) => result.ok).length;
  let status = "write_failed";
  if (successCount === hookResults.length) status = "update_success";
  else if (successCount > 0) status = "partial_update_success";

  return {
    action: "update",
    project: item.project,
    status,
    hookResults
  };
}

function summarizePreview(items) {
  return {
    totalProjects: items.length,
    createProjects: items.filter((item) => item.action === "create").length,
    updateProjects: items.filter((item) => item.action === "update").length,
    updateHooks: items.reduce((total, item) => total + item.hookIds.length, 0),
    failedProjects: items.filter((item) => item.action === "failed").length
  };
}

function summarizeExecution(items) {
  return {
    totalProjects: items.length,
    successProjects: items.filter((item) => item.status === "create_success" || item.status === "update_success").length,
    partialProjects: items.filter((item) => item.status === "partial_update_success").length,
    failedProjects: items.filter((item) => item.status === "write_failed").length
  };
}

function publicError(error, fallback) {
  return {
    code: error?.code ?? "UNKNOWN_ERROR",
    message: error?.message ?? fallback
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
