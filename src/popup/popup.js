import {
  createErrorView,
  createExecutionView,
  createPreviewView,
  createSuccessView
} from "./popup-view.js";
import { describeSelectedEvents } from "../core/webhook-config.js";
import {
  createProjectIdSnapshot,
  createSelectedProjectIds,
  filterProjects,
  getProjectLabel,
  getSelectedProjects,
  getSelectionState
} from "./project-selection.js";
import {
  buildPreviewRequest,
  invalidatePreviewState,
  validateApplySelection
} from "./popup-selection-flow.js";

const scanButton = document.querySelector("#scan");
const openOptionsButton = document.querySelector("#open-options");
const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const groupName = document.querySelector("#group-name");
const projectCount = document.querySelector("#project-count");
const projectList = document.querySelector("#projects");
const projectControls = document.querySelector("#project-controls");
const selectAll = document.querySelector("#select-all");
const selectedCount = document.querySelector("#selected-count");
const projectSearch = document.querySelector("#project-search");
const previewSelectedButton = document.querySelector("#preview-selected");
const webhookResult = document.querySelector("#webhook-result");
const webhookTitle = document.querySelector("#webhook-title");
const webhookSummary = document.querySelector("#webhook-summary");
const webhookItems = document.querySelector("#webhook-items");
const eventSummary = document.querySelector("#event-summary");
const applyButton = document.querySelector("#apply");
const downloadLogButton = document.querySelector("#download-log");

let latestPreview = null;
let latestOrigin = "";
let latestConfig = null;
let latestPreviewUrl = "";
let scannedProjects = [];
let selectedProjectIds = new Set();
let latestPreviewProjectIds = [];
const logEntries = [];

loadDefaults();
addLog("Popup 已打开。");

function resetResults() {
  summary.hidden = true;
  projectList.replaceChildren();
  scannedProjects = [];
  selectedProjectIds = new Set();
  latestPreviewProjectIds = [];
  projectControls.hidden = true;
  previewSelectedButton.hidden = true;
  projectSearch.value = "";
  latestOrigin = "";
  resetWebhookResult();
}

function resetWebhookResult() {
  latestPreview = null;
  latestPreviewProjectIds = [];
  latestPreviewUrl = "";
  webhookResult.hidden = true;
  applyButton.hidden = true;
  webhookItems.replaceChildren();
  eventSummary.textContent = "Events";
}

function renderProjects(view) {
  summary.hidden = false;
  status.textContent = view.status;
  groupName.textContent = view.groupName;
  projectCount.textContent = view.projectCount;
  scanButton.textContent = view.buttonLabel;

  renderProjectRows();
}

function renderProjectRows() {
  const visibleProjects = filterProjects(scannedProjects, projectSearch.value);
  projectList.replaceChildren(...visibleProjects.map((project) => {
    const item = document.createElement("li");
    item.className = "list-row";
    const row = document.createElement("label");
    row.className = "project-check-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedProjectIds.has(String(project.id));
    checkbox.dataset.projectId = String(project.id);
    const link = document.createElement("a");
    link.href = project.web_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "row-title";
    link.textContent = getProjectLabel(project);
    row.append(checkbox, link);
    item.append(row);
    return item;
  }));
  updateSelectionSummary();
}

function updateSelectionSummary() {
  const state = getSelectionState(selectedProjectIds, scannedProjects.length);
  selectAll.checked = state.checked;
  selectAll.indeterminate = state.indeterminate;
  selectedCount.textContent = `已选择 ${state.selectedCount} / ${state.totalCount}`;
}

function invalidatePreviewForSelectionChange() {
  const invalidated = invalidatePreviewState(latestPreview, latestPreviewProjectIds);
  latestPreview = invalidated.latestPreview;
  latestPreviewProjectIds = invalidated.latestPreviewProjectIds;
  webhookResult.hidden = true;
  applyButton.hidden = true;
  if (invalidated.wasPreviewed) status.textContent = "项目选择已变更，请重新预览。";
}

async function loadDefaults() {
  const defaults = await chrome.storage.local.get({
    webhookUrl: "",
    webhookToken: "",
    events: { comments: true }
  });

  latestConfig = {
    url: defaults.webhookUrl,
    token: defaults.webhookToken,
    events: defaults.events,
    enableSslVerification: false
  };
  addLog("已加载默认 Webhook 配置。", {
    hasUrl: Boolean(latestConfig.url),
    hasToken: Boolean(latestConfig.token),
    events: describeSelectedEvents(latestConfig.events)
  });
  return latestConfig;
}

function addLog(message, details = {}) {
  const timestamp = new Date().toISOString();
  const suffix = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  logEntries.push(`[${timestamp}] ${message}${suffix}`);
  console.info("[GitLab HookPilot]", message, details);
}

function renderWebhookItems(view) {
  webhookSummary.textContent = view.summaryText;
  webhookItems.replaceChildren(...view.items.map((entry) => {
    const item = document.createElement("li");
    item.className = "list-row split-row";
    const name = document.createElement("span");
    const action = document.createElement("span");

    name.className = "row-title";
    action.className = `badge ${badgeClass(entry.action)}`;
    name.textContent = entry.label;
    action.textContent = entry.error ? `${entry.action}：${entry.error}` : entry.action;
    item.append(name, action);
    return item;
  }));
}

function badgeClass(label) {
  if (label.includes("创建")) return "badge-create";
  if (label.includes("更新")) return "badge-update";
  if (label.includes("成功")) return "badge-success";
  if (label.includes("失败")) return "badge-failed";
  return "";
}

async function previewWebhookChanges() {
  const config = await loadDefaults();
  resetWebhookResult();

  if (!config.url) {
    webhookResult.hidden = false;
    webhookTitle.textContent = "需要设置";
    webhookSummary.textContent = "请点击右上角设置，填写 Webhook URL 后重新扫描。Secret Token 可选。";
    eventSummary.textContent = describeSelectedEvents(config.events);
    status.textContent = "缺少 Webhook 设置。";
    addLog("缺少 Webhook 设置，跳过预览。", {
      hasUrl: Boolean(config.url),
      hasToken: Boolean(config.token)
    });
    return;
  }

  status.textContent = "正在读取各项目已有 Webhook…";
  addLog("开始自动预览 Webhook 变更。", {
    url: config.url,
    events: describeSelectedEvents(config.events),
    ssl: false,
    hasToken: Boolean(config.token)
  });

  try {
    const request = buildPreviewRequest(scannedProjects, selectedProjectIds, config);
    if (!request.ok) throw new Error(request.error);
    const result = await chrome.runtime.sendMessage(request.message);
    if (!result?.ok) throw new Error(result?.error?.message);

    latestPreview = result;
    latestPreviewProjectIds = createProjectIdSnapshot(getSelectedProjects(scannedProjects, selectedProjectIds));
    latestOrigin = result.origin;
    latestPreviewUrl = config.url;
    const view = createPreviewView(result);
    webhookResult.hidden = false;
    webhookTitle.textContent = "变更预览";
    eventSummary.textContent = describeSelectedEvents(config.events);
    status.textContent = view.status;
    renderWebhookItems(view);
    applyButton.hidden = result.items.every((item) => item.action !== "create" && item.action !== "update");
    addLog("预览完成。", result.summary);
  } catch (error) {
    const view = createErrorView(error);
    status.textContent = view.status;
    addLog("预览失败。", { message: view.status });
  }
}

scanButton.addEventListener("click", async () => {
  resetResults();
  await chrome.runtime.sendMessage({ type: "CLEAR_BACKGROUND_LOGS" }).catch(() => {});
  addLog("开始检查当前 GitLab 可配置项目。");
  scanButton.disabled = true;
  scanButton.textContent = "正在检查…";
  status.textContent = "正在验证登录状态并读取项目…";

  try {
    const result = await chrome.runtime.sendMessage({ type: "SCAN_ACTIVE_GROUP" });
    if (!result?.ok) throw new Error(result?.error?.message);
    scannedProjects = result.data.projects;
    selectedProjectIds = createSelectedProjectIds(scannedProjects);
    projectControls.hidden = false;
    previewSelectedButton.hidden = scannedProjects.length === 0;
    renderProjects(createSuccessView(result.data));
    latestOrigin = result.data.context.origin;
    addLog("扫描完成。", {
      origin: latestOrigin,
      manageableProjects: result.data.projects.length,
      skippedProjects: result.data.skippedProjects ?? 0
    });
  } catch (error) {
    const view = createErrorView(error);
    status.textContent = view.status;
    scanButton.textContent = view.buttonLabel;
    addLog("扫描失败。", { message: view.status });
  } finally {
    scanButton.disabled = false;
  }
});

previewSelectedButton.addEventListener("click", previewWebhookChanges);

projectSearch.addEventListener("input", renderProjectRows);

selectAll.addEventListener("change", () => {
  selectedProjectIds = selectAll.checked ? createSelectedProjectIds(scannedProjects) : new Set();
  invalidatePreviewForSelectionChange();
  renderProjectRows();
});

projectList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-project-id]");
  if (!checkbox) return;
  if (checkbox.checked) selectedProjectIds.add(checkbox.dataset.projectId);
  else selectedProjectIds.delete(checkbox.dataset.projectId);
  invalidatePreviewForSelectionChange();
  updateSelectionSummary();
});

applyButton.addEventListener("click", async () => {
  if (!latestPreview) return;

  const selectionValidation = validateApplySelection(
    scannedProjects,
    selectedProjectIds,
    latestPreviewProjectIds
  );
  if (!selectionValidation.ok) {
    status.textContent = selectionValidation.error;
    invalidatePreviewForSelectionChange();
    return;
  }

  applyButton.disabled = true;
  const currentConfig = await loadDefaults();

  if (!currentConfig.url) {
    status.textContent = "缺少 Webhook 设置，请先填写 Webhook URL。";
    addLog("执行前发现 Webhook 设置缺失。", {
      hasUrl: Boolean(currentConfig.url),
      hasToken: Boolean(currentConfig.token)
    });
    applyButton.disabled = false;
    return;
  }

  if (currentConfig.url !== latestPreviewUrl) {
    status.textContent = "Webhook URL 已变更，请重新检查后再执行。";
    addLog("执行前发现 Webhook URL 已变更，已停止写入。", {
      previewUrl: latestPreviewUrl,
      currentUrl: currentConfig.url
    });
    applyButton.disabled = false;
    return;
  }

  latestConfig = currentConfig;
  eventSummary.textContent = describeSelectedEvents(latestConfig.events);
  addLog("开始执行 Webhook 写入。", {
    origin: latestOrigin,
    items: latestPreview.items.length,
    events: describeSelectedEvents(latestConfig.events)
  });
  applyButton.textContent = "正在执行…";
  status.textContent = "正在创建或更新 Webhook…";

  try {
    const result = await chrome.runtime.sendMessage({
      type: "APPLY_WEBHOOK_CHANGES",
      items: latestPreview.items,
      config: latestConfig,
      origin: latestOrigin
    });
    if (!result?.ok) throw new Error(result?.error?.message);

    appendExternalLogs(result.debugLogs);
    const view = createExecutionView(result);
    webhookTitle.textContent = "执行结果";
    status.textContent = view.status;
    renderWebhookItems(view);
    applyButton.hidden = true;
    addLog("执行完成。", {
      summary: result.summary,
      statuses: countStatuses(result.items)
    });
  } catch (error) {
    const view = createErrorView(error);
    status.textContent = view.status;
    addLog("执行失败。", { message: view.status });
  } finally {
    applyButton.disabled = false;
    applyButton.textContent = "确认执行";
  }
});

downloadLogButton.addEventListener("click", async () => {
  const backgroundLogs = await chrome.runtime.sendMessage({ type: "GET_BACKGROUND_LOGS" })
    .then((result) => result?.entries ?? [])
    .catch((error) => {
      addLog("读取后台日志失败。", { message: error?.message ?? "unknown error" });
      return [];
    });
  addLog("下载日志。", {
    popupEntries: logEntries.length + 1,
    backgroundEntries: backgroundLogs.length
  });

  const entries = Array.from(new Set([...logEntries, ...backgroundLogs])).sort();
  const content = entries.length > 0
    ? `${entries.join("\n")}\n`
    : "暂无日志。\n";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  link.href = url;
  link.download = `gitlab-hookpilot-${timestamp}.log`;
  link.click();
  URL.revokeObjectURL(url);
});

openOptionsButton.addEventListener("click", () => {
  addLog("打开设置页。");
  chrome.runtime.openOptionsPage();
});

function countStatuses(items = []) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
}

function appendExternalLogs(entries = []) {
  for (const entry of entries) {
    if (typeof entry === "string" && !logEntries.includes(entry)) {
      logEntries.push(entry);
    }
  }
}
