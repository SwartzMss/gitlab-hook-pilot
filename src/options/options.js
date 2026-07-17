import { describeSelectedEvents, normalizeEvents } from "../core/webhook-config.js";

const form = document.querySelector("#options-form");
const status = document.querySelector("#status");
const webhookUrl = document.querySelector("#webhook-url");
const webhookToken = document.querySelector("#webhook-token");
const toggleTokenButton = document.querySelector("#toggle-token");
const eventComments = document.querySelector("#event-comments");
const eventMergeRequests = document.querySelector("#event-merge-requests");
const eventPush = document.querySelector("#event-push");
const eventPipeline = document.querySelector("#event-pipeline");
const eventTagPush = document.querySelector("#event-tag-push");
const eventIssues = document.querySelector("#event-issues");

loadOptions();

async function loadOptions() {
  const options = await chrome.storage.local.get({
    webhookUrl: "",
    webhookToken: "",
    events: defaultEvents()
  });

  webhookUrl.value = options.webhookUrl;
  webhookToken.value = options.webhookToken;
  writeEvents(options.events);
  status.textContent = `默认只启用 Comments。当前事件：${describeSelectedEvents(options.events)}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (webhookUrl.value && webhookUrl.value !== webhookUrl.value.trim()) {
    status.textContent = "Webhook URL 前后不能包含空白。";
    return;
  }

  await chrome.storage.local.set({
    webhookUrl: webhookUrl.value,
    webhookToken: webhookToken.value,
    events: readEvents()
  });

  status.textContent = `设置已保存。当前事件：${describeSelectedEvents(readEvents())}`;
});

toggleTokenButton.addEventListener("click", () => {
  const visible = webhookToken.type === "text";
  webhookToken.type = visible ? "password" : "text";
  toggleTokenButton.textContent = visible ? "显示" : "隐藏";
});

function defaultEvents() {
  return {
    comments: true,
    mergeRequests: false,
    push: false,
    pipeline: false,
    tagPush: false,
    issues: false
  };
}

function readEvents() {
  return {
    comments: eventComments.checked,
    mergeRequests: eventMergeRequests.checked,
    push: eventPush.checked,
    pipeline: eventPipeline.checked,
    tagPush: eventTagPush.checked,
    issues: eventIssues.checked
  };
}

function writeEvents(events = defaultEvents()) {
  const normalized = normalizeEvents(events);
  eventComments.checked = normalized.comments;
  eventMergeRequests.checked = normalized.mergeRequests;
  eventPush.checked = normalized.push;
  eventPipeline.checked = normalized.pipeline;
  eventTagPush.checked = normalized.tagPush;
  eventIssues.checked = normalized.issues;
}
