const UNMANAGED_EVENT_FIELDS = [];

export const WEBHOOK_EVENT_LABELS = {
  comments: "Comments",
  mergeRequests: "Merge requests",
  push: "Push events",
  pipeline: "Pipeline events",
  tagPush: "Tag push events",
  issues: "Issues events"
};

export function validateWebhookConfig(config) {
  if (!config?.url) {
    return validationError("Webhook URL 不能为空。");
  }

  if (config.url !== config.url.trim()) {
    return validationError("Webhook URL 前后不能包含空白。");
  }

  let url;
  try {
    url = new URL(config.url);
  } catch {
    return validationError("Webhook URL 必须是有效地址。");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return validationError("Webhook URL 必须使用 HTTP 或 HTTPS。");
  }

  const events = normalizeEvents(config.events);
  if (!Object.values(events).some(Boolean)) {
    return validationError("至少选择一种事件。");
  }

  return {
    ok: true,
    config: {
      url: config.url,
      token: config.token ?? "",
      events,
      enableSslVerification: config.enableSslVerification === true
    }
  };
}

export function buildHookPayload(config, existingHook = null) {
  const events = normalizeEvents(config.events);
  const payload = {
    url: config.url,
    merge_requests_events: events.mergeRequests,
    note_events: events.comments,
    push_events: events.push,
    push_events_branch_filter: "",
    branch_filter_strategy: "wildcard",
    tag_push_events: events.tagPush,
    issues_events: events.issues,
    confidential_issues_events: false,
    job_events: false,
    pipeline_events: events.pipeline,
    wiki_page_events: false,
    deployment_events: false,
    releases_events: false,
    enable_ssl_verification: config.enableSslVerification === true
  };

  if (config.token) {
    payload.token = config.token;
  }

  if (!existingHook) return payload;

  for (const field of UNMANAGED_EVENT_FIELDS) {
    if (Object.hasOwn(existingHook, field)) {
      payload[field] = existingHook[field];
    }
  }

  return payload;
}

function validationError(message) {
  return {
    ok: false,
    error: { code: "INVALID_WEBHOOK_CONFIG", message }
  };
}

export function normalizeEvents(events = {}) {
  const source = events ?? {};
  return {
    comments: readEvent(source, "comments", "note_events", true),
    mergeRequests: readEvent(source, "mergeRequests", "merge_requests_events", false),
    push: readEvent(source, "push", "push_events", false),
    pipeline: readEvent(source, "pipeline", "pipeline_events", false),
    tagPush: readEvent(source, "tagPush", "tag_push_events", false),
    issues: readEvent(source, "issues", "issues_events", false)
  };
}

export function describeSelectedEvents(events = {}) {
  const normalized = normalizeEvents(events);
  const labels = Object.entries(normalized)
    .filter(([, enabled]) => enabled)
    .map(([key]) => WEBHOOK_EVENT_LABELS[key]);

  return labels.length > 0 ? labels.join(", ") : "未选择事件";
}

function readEvent(events, storageKey, apiKey, fallback) {
  if (Object.hasOwn(events, storageKey)) return Boolean(events[storageKey]);
  if (Object.hasOwn(events, apiKey)) return Boolean(events[apiKey]);
  return fallback;
}
