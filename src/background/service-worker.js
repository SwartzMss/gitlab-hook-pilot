import * as gitlabApi from "../core/gitlab-api.js";
import { scanGroupUrl } from "../core/scan-group.js";
import { describeSelectedEvents } from "../core/webhook-config.js";
import { buildWebhookPreview, executeWebhookPlan } from "../core/webhook-plan.js";

const LOG_STORAGE_KEY = "gitlabHookPilotLogs";
const logEntries = [];
let logWriteQueue = Promise.resolve();

async function getActivePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log("active tab lookup", { tabId: tab?.id, url: sanitizeUrl(tab?.url) });
  if (!tab?.id) {
    log("active tab unavailable");
    return null;
  }

  const page = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }).catch((error) => {
    log("page context lookup failed", { message: error?.message ?? "unknown error" });
    return null;
  });

  log("page context lookup finished", {
    hasUrl: Boolean(page?.url),
    hasCsrfToken: Boolean(page?.csrfToken)
  });
  return page;
}

async function scanActiveGroup() {
  log("scan started");
  const page = await getActivePage();
  const result = await scanGroupUrl(page?.url ?? "", gitlabApi);
  log("scan finished", summarizeResult(result));
  return result;
}

async function previewWebhookChanges(config) {
  log("webhook preview started", sanitizeConfig(config));
  const page = await getActivePage();
  const scan = await scanGroupUrl(page?.url ?? "", gitlabApi);
  if (!scan.ok) {
    log("webhook preview scan failed", summarizeResult(scan));
    return scan;
  }

  const preview = await buildWebhookPreview(
    scan.data.projects,
    config,
    gitlabApi,
    scan.data.context.origin
  );
  if (!preview.ok) {
    log("webhook preview validation failed", preview.error);
    return preview;
  }

  log("webhook preview finished", {
    origin: scan.data.context.origin,
    summary: preview.summary
  });
  return { ...preview, origin: scan.data.context.origin };
}

async function applyWebhookChanges(items, config, origin) {
  const operationLogs = [];
  const logOperation = (message, details = {}) => {
    const entry = formatLogEntry(message, details);
    operationLogs.push(entry);
    log(message, details);
  };

  log("webhook apply started", {
    origin,
    itemCount: items.length,
    config: sanitizeConfig(config)
  });

  if (!origin) {
    const result = {
      ok: false,
      error: {
        code: "MISSING_ORIGIN",
        message: "缺少 GitLab 实例信息，请重新预览后再执行。"
      }
    };
    log("webhook apply rejected", result.error);
    return result;
  }

  const page = await getActivePage();
  const api = {
    ...gitlabApi,
    createProjectHook: async (projectOrigin, projectId, payload) => {
      logOperation("create hook request", {
        origin: projectOrigin,
        projectId,
        payload: sanitizePayload(payload)
      });
      const created = await gitlabApi.createProjectHook(projectOrigin, projectId, payload, fetch, page?.csrfToken ?? "");
      logOperation("create hook response", {
        origin: projectOrigin,
        projectId,
        hook: sanitizeHook(created)
      });
      return created;
    },
    updateProjectHook: async (projectOrigin, projectId, hookId, payload) => {
      logOperation("update hook request", {
        origin: projectOrigin,
        projectId,
        hookId,
        payload: sanitizePayload(payload)
      });
      const updated = await gitlabApi.updateProjectHook(projectOrigin, projectId, hookId, payload, fetch, page?.csrfToken ?? "");
      logOperation("update hook response", {
        origin: projectOrigin,
        projectId,
        hookId,
        hook: sanitizeHook(updated)
      });
      return updated;
    }
  };

  const result = await executeWebhookPlan(items, config, api, origin);
  log("webhook apply finished", summarizeResult(result));
  return { ...result, debugLogs: operationLogs };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCAN_ACTIVE_GROUP") {
    respondWithLogging("SCAN_ACTIVE_GROUP", scanActiveGroup(), sendResponse);
    return true;
  }

  if (message?.type === "PREVIEW_WEBHOOK_CHANGES") {
    respondWithLogging("PREVIEW_WEBHOOK_CHANGES", previewWebhookChanges(message.config), sendResponse);
    return true;
  }

  if (message?.type === "APPLY_WEBHOOK_CHANGES") {
    respondWithLogging(
      "APPLY_WEBHOOK_CHANGES",
      applyWebhookChanges(message.items ?? [], message.config, message.origin),
      sendResponse
    );
    return true;
  }

  if (message?.type === "GET_BACKGROUND_LOGS") {
    logWriteQueue
      .then(getStoredLogs)
      .then((entries) => sendResponse({ ok: true, entries }));
    return true;
  }

  if (message?.type === "CLEAR_BACKGROUND_LOGS") {
    logEntries.splice(0, logEntries.length);
    logWriteQueue = logWriteQueue
      .then(() => chrome.storage.local.set({ [LOG_STORAGE_KEY]: [] }))
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

function respondWithLogging(type, promise, sendResponse) {
  promise
    .then(sendResponse)
    .catch((error) => {
      const result = {
        ok: false,
        error: {
          code: error?.code ?? "UNKNOWN_ERROR",
          message: error?.message ?? "后台处理失败。"
        }
      };
      log("message handling failed", { type, error: result.error });
      sendResponse(result);
    });
}

function log(message, details = {}) {
  const entry = formatLogEntry(message, details);
  logEntries.push(entry);
  if (logEntries.length > 500) logEntries.splice(0, logEntries.length - 500);
  persistLog(entry).catch((error) => {
    console.warn("[GitLab HookPilot] failed to persist log", error);
  });
  console.info("[GitLab HookPilot]", message, details);
}

function formatLogEntry(message, details = {}) {
  const timestamp = new Date().toISOString();
  const suffix = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  return `[${timestamp}] ${message}${suffix}`;
}

async function persistLog(entry) {
  logWriteQueue = logWriteQueue.then(async () => {
    const entries = await getStoredLogs();
    entries.push(entry);
    if (entries.length > 500) entries.splice(0, entries.length - 500);
    await chrome.storage.local.set({ [LOG_STORAGE_KEY]: entries });
  });
  await logWriteQueue;
}

async function getStoredLogs() {
  const stored = await chrome.storage.local.get({ [LOG_STORAGE_KEY]: [] });
  return stored[LOG_STORAGE_KEY];
}

function summarizeResult(result) {
  if (!result?.ok) {
    return { ok: false, error: result?.error };
  }

  return {
    ok: true,
    summary: result.summary,
    projectCount: result.data?.projects?.length,
    skippedProjects: result.data?.skippedProjects,
    origin: result.data?.context?.origin
  };
}

function sanitizeConfig(config = {}) {
  return {
    url: config.url,
    hasToken: Boolean(config.token),
    events: describeSelectedEvents(config.events),
    enableSslVerification: config.enableSslVerification
  };
}

function sanitizePayload(payload = {}) {
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

function sanitizeHook(hook = {}) {
  return {
    id: hook.id,
    url: hook.url,
    token_present: hook.token_present,
    events: {
      note_events: hook.note_events,
      merge_requests_events: hook.merge_requests_events,
      push_events: hook.push_events,
      pipeline_events: hook.pipeline_events,
      tag_push_events: hook.tag_push_events,
      issues_events: hook.issues_events
    },
    push_events_branch_filter: hook.push_events_branch_filter,
    branch_filter_strategy: hook.branch_filter_strategy,
    enable_ssl_verification: hook.enable_ssl_verification
  };
}

function sanitizeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}
