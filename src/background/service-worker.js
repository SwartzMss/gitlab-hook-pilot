import * as gitlabApi from "../core/gitlab-api.js";
import { scanGroupUrl } from "../core/scan-group.js";

async function scanActiveGroup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const page = tab?.id
    ? await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }).catch(() => null)
    : null;

  return scanGroupUrl(page?.url ?? "", gitlabApi);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCAN_ACTIVE_GROUP") return false;

  scanActiveGroup().then(sendResponse);
  return true;
});
