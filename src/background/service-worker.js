import * as gitlabApi from "../core/gitlab-api.js";
import { scanGroupUrl } from "../core/scan-group.js";
import { describeSelectedEvents } from "../core/webhook-config.js";
import { executeWebhookPlan } from "../core/webhook-plan.js";
import { parseGitLabGroupUrl } from "../core/gitlab-context.js";
import { previewSelectedProjects } from "./preview-request.js";
import { createWebhookOperationApi } from "./webhook-operation-api.js";
import { sanitizeWebhookUrl } from "../core/log-sanitizer.js";

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

async function previewWebhookChanges(projects, config) {
  log("webhook preview started", sanitizeConfig(config));
  const page = await getActivePage();
  const context = parseGitLabGroupUrl(page?.url ?? "");
  const preview = await previewSelectedProjects({
    projects,
    config,
    api: gitlabApi,
    origin: context?.origin ?? ""
  });
  if (!preview.ok) {
    log("webhook preview validation failed", preview.error);
    return preview;
  }

  log("webhook preview finished", {
    origin: preview.origin,
    summary: preview.summary
  });
  return preview;
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
  const api = createWebhookOperationApi({
    items,
    csrfToken: page?.csrfToken ?? "",
    fetchImpl: fetch,
    api: gitlabApi,
    logOperation
  });

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
    respondWithLogging(
      "PREVIEW_WEBHOOK_CHANGES",
      previewWebhookChanges(message.projects ?? [], message.config),
      sendResponse
    );
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
    url: sanitizeWebhookUrl(config.url),
    hasToken: Boolean(config.token),
    events: describeSelectedEvents(config.events),
    enableSslVerification: config.enableSslVerification
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
