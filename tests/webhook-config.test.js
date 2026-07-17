import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHookPayload,
  describeSelectedEvents,
  normalizeEvents,
  validateWebhookConfig
} from "../src/core/webhook-config.js";

test("requires URL and token", () => {
  assert.equal(validateWebhookConfig({
    url: "",
    token: "secret",
    enableSslVerification: true
  }).ok, false);

  assert.equal(validateWebhookConfig({
    url: "https://hooks.example.com/gitlab",
    token: "",
    enableSslVerification: true
  }).ok, false);
});

test("requires at least one event", () => {
  const result = validateWebhookConfig({
    url: "https://hooks.example.com/gitlab",
    token: "secret",
    events: {
      comments: false,
      mergeRequests: false,
      push: false,
      pipeline: false,
      tagPush: false,
      issues: false
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.error.message, /至少选择一种事件/);
});

test("rejects URL whitespace without normalizing the configured URL", () => {
  const result = validateWebhookConfig({
    url: " https://hooks.example.com/gitlab",
    token: "secret",
    enableSslVerification: true
  });

  assert.equal(result.ok, false);
  assert.match(result.error.message, /前后不能包含空白/);
});

test("accepts HTTP and HTTPS webhook URLs", () => {
  assert.equal(validateWebhookConfig({
    url: "http://hooks.example.com/gitlab?project=one",
    token: "secret"
  }).ok, true);
});

test("maps only comments and disables other managed events", () => {
  const payload = buildHookPayload({
    url: "https://hooks.example.com/gitlab",
    token: "secret",
    enableSslVerification: true
  }, {
    push_events: true,
    push_events_branch_filter: "*",
    tag_push_events: true,
    pipeline_events: false
  });

  assert.deepEqual(payload, {
    url: "https://hooks.example.com/gitlab",
    token: "secret",
    merge_requests_events: false,
    note_events: true,
    push_events: false,
    push_events_branch_filter: "",
    branch_filter_strategy: "wildcard",
    tag_push_events: false,
    issues_events: false,
    confidential_issues_events: false,
    job_events: false,
    pipeline_events: false,
    wiki_page_events: false,
    deployment_events: false,
    releases_events: false,
    enable_ssl_verification: true
  });
});

test("maps selected common events", () => {
  const payload = buildHookPayload({
    url: "https://hooks.example.com/gitlab",
    token: "secret",
    events: {
      comments: true,
      mergeRequests: true,
      push: true,
      pipeline: true,
      tagPush: true,
      issues: true
    }
  });

  assert.equal(payload.note_events, true);
  assert.equal(payload.merge_requests_events, true);
  assert.equal(payload.push_events, true);
  assert.equal(payload.pipeline_events, true);
  assert.equal(payload.tag_push_events, true);
  assert.equal(payload.issues_events, true);
  assert.equal(payload.push_events_branch_filter, "");
});

test("normalizes stored events and GitLab API event keys", () => {
  assert.deepEqual(normalizeEvents({
    note_events: true,
    merge_requests_events: true,
    push_events: false,
    pipeline_events: true,
    tag_push_events: true,
    issues_events: false
  }), {
    comments: true,
    mergeRequests: true,
    push: false,
    pipeline: true,
    tagPush: true,
    issues: false
  });

  assert.equal(
    describeSelectedEvents({ comments: true, mergeRequests: true }),
    "Comments, Merge requests"
  );
});

test("disables SSL verification and push events by default", () => {
  const payload = buildHookPayload({
    url: "https://hooks.example.com/gitlab",
    token: "secret"
  });

  assert.equal(payload.enable_ssl_verification, false);
  assert.equal(payload.push_events, false);
  assert.equal(payload.push_events_branch_filter, "");
  assert.equal(payload.branch_filter_strategy, "wildcard");
  assert.equal(payload.tag_push_events, false);
});
