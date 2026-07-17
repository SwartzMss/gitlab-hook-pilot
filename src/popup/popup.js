import { createErrorView, createSuccessView } from "./popup-view.js";

const scanButton = document.querySelector("#scan");
const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const groupName = document.querySelector("#group-name");
const projectCount = document.querySelector("#project-count");
const projectList = document.querySelector("#projects");

function resetResults() {
  summary.hidden = true;
  projectList.replaceChildren();
}

function renderProjects(view) {
  summary.hidden = false;
  status.textContent = view.status;
  groupName.textContent = view.groupName;
  projectCount.textContent = view.projectCount;
  scanButton.textContent = view.buttonLabel;

  projectList.replaceChildren(...view.projects.map((project) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = project.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = project.label;
    item.append(link);
    return item;
  }));
}

scanButton.addEventListener("click", async () => {
  resetResults();
  scanButton.disabled = true;
  scanButton.textContent = "正在扫描…";
  status.textContent = "正在验证登录状态并读取项目…";

  try {
    const result = await chrome.runtime.sendMessage({ type: "SCAN_ACTIVE_GROUP" });
    if (!result?.ok) throw new Error(result?.error?.message);
    renderProjects(createSuccessView(result.data));
  } catch (error) {
    const view = createErrorView(error);
    status.textContent = view.status;
    scanButton.textContent = view.buttonLabel;
  } finally {
    scanButton.disabled = false;
  }
});
