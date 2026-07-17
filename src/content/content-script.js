chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_PAGE_CONTEXT") return false;

  sendResponse({ url: window.location.href });
  return false;
});
