# GitLab HookPilot Read-Only MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a loadable Manifest V3 extension that recognizes a GitLab Group page, reuses the signed-in session, scans all visible projects including nested subgroups, and displays read-only results.

**Architecture:** The popup asks the background service worker to inspect the active tab and execute the scan. Pure URL and HTTP helpers remain independent ES modules so Node's built-in test runner can verify them without browser mocks; the service worker owns browser APIs and delegates network behavior to the API module.

**Tech Stack:** Manifest V3, native HTML/CSS/JavaScript ES modules, Chrome Extensions API, GitLab REST API v4, Node.js built-in test runner.

---

## File map

- `manifest.json`: extension metadata, permissions, popup, and background entry point.
- `package.json`: ES module mode and test command; no third-party dependencies.
- `src/core/gitlab-context.js`: pure GitLab Group URL parsing.
- `src/core/gitlab-api.js`: authenticated GET requests, error normalization, and pagination.
- `src/content/content-script.js`: exposes the current page URL without reading page content or cookies.
- `src/background/service-worker.js`: active-tab lookup and popup message handling.
- `src/popup/popup.html`: accessible popup structure.
- `src/popup/popup.css`: compact status and project-list presentation.
- `src/popup/popup.js`: popup state rendering and background messaging.
- `tests/gitlab-context.test.js`: URL parser coverage.
- `tests/gitlab-api.test.js`: API error and pagination coverage.
- `README.md`: user-focused product documentation and implementation status.

### Task 1: Test harness and extension shell

**Files:**
- Create: `package.json`
- Create: `manifest.json`

- [ ] **Step 1: Add the dependency-free test command**

```json
{
  "name": "gitlab-hook-pilot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Run the empty suite**

Run: `npm test`
Expected: PASS with zero tests and exit code 0.

- [ ] **Step 3: Add the Manifest V3 shell**

```json
{
  "manifest_version": 3,
  "name": "GitLab HookPilot",
  "version": "0.1.0",
  "description": "Scan projects in a GitLab group before managing project webhooks in bulk.",
  "permissions": ["activeTab", "scripting"],
  "host_permissions": ["https://*/*", "http://*/*"],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://*/*", "http://*/*"],
    "js": ["src/content/content-script.js"]
  }],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "GitLab HookPilot"
  }
}
```

- [ ] **Step 4: Validate JSON files**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json')); JSON.parse(require('fs').readFileSync('package.json'))"`
Expected: exit code 0 with no output.

- [ ] **Step 5: Commit**

```bash
git add package.json manifest.json
git commit -m "chore: add extension and test shell"
```

### Task 2: GitLab Group URL recognition

**Files:**
- Create: `tests/gitlab-context.test.js`
- Create: `src/core/gitlab-context.js`

- [ ] **Step 1: Write failing URL recognition tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseGitLabGroupUrl } from "../src/core/gitlab-context.js";

test("recognizes a top-level group", () => {
  assert.deepEqual(parseGitLabGroupUrl("https://gitlab.example.com/groups/platform/-/activity"), {
    origin: "https://gitlab.example.com",
    groupPath: "platform"
  });
});

test("recognizes a nested group", () => {
  assert.deepEqual(parseGitLabGroupUrl("https://gitlab.example.com/groups/platform/tools/-/projects"), {
    origin: "https://gitlab.example.com",
    groupPath: "platform/tools"
  });
});

for (const url of [
  "https://gitlab.example.com/platform/project",
  "https://gitlab.example.com/users/sign_in",
  "chrome://extensions"
]) {
  test(`rejects non-group URL: ${url}`, () => {
    assert.equal(parseGitLabGroupUrl(url), null);
  });
}
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/gitlab-context.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/core/gitlab-context.js`.

- [ ] **Step 3: Implement the pure parser**

```js
export function parseGitLabGroupUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const match = url.pathname.match(/^\/groups\/(.+?)(?:\/-\/.*)?\/?$/);
  if (!match) return null;

  const groupPath = match[1]
    .split("/")
    .map((part) => decodeURIComponent(part))
    .filter(Boolean)
    .join("/");

  return groupPath ? { origin: url.origin, groupPath } : null;
}
```

- [ ] **Step 4: Verify parser tests pass**

Run: `node --test tests/gitlab-context.test.js`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/gitlab-context.js tests/gitlab-context.test.js
git commit -m "feat: recognize GitLab group pages"
```

### Task 3: GitLab API errors and project pagination

**Files:**
- Create: `tests/gitlab-api.test.js`
- Create: `src/core/gitlab-api.js`

- [ ] **Step 1: Write failing API tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { GitLabApiError, fetchAllGroupProjects, mapHttpError } from "../src/core/gitlab-api.js";

test("maps known GitLab HTTP statuses", () => {
  assert.equal(mapHttpError(401).code, "SIGNED_OUT");
  assert.equal(mapHttpError(403).code, "FORBIDDEN");
  assert.equal(mapHttpError(404).code, "NOT_FOUND");
  assert.equal(mapHttpError(500).code, "API_ERROR");
});

test("loads and merges every project page", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const page = new URL(url).searchParams.get("page");
    return {
      ok: true,
      headers: new Headers({ "x-next-page": page === "1" ? "2" : "" }),
      json: async () => page === "1" ? [{ id: 1, name: "One" }] : [{ id: 2, name: "Two" }]
    };
  };

  const projects = await fetchAllGroupProjects("https://gitlab.example.com", "platform/tools", fetchImpl);
  assert.deepEqual(projects.map(({ id }) => id), [1, 2]);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /include_subgroups=true/);
  assert.match(calls[0], /per_page=100/);
});

test("throws a normalized error without accepting partial results", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403 });
  await assert.rejects(
    fetchAllGroupProjects("https://gitlab.example.com", "platform", fetchImpl),
    (error) => error instanceof GitLabApiError && error.code === "FORBIDDEN"
  );
});
```

- [ ] **Step 2: Verify API tests fail**

Run: `node --test tests/gitlab-api.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/core/gitlab-api.js`.

- [ ] **Step 3: Implement authenticated GET helpers and pagination**

```js
const ERROR_DETAILS = {
  401: ["SIGNED_OUT", "GitLab 登录状态已失效，请重新登录。"],
  403: ["FORBIDDEN", "当前账户没有读取该 Group 的权限。"],
  404: ["NOT_FOUND", "找不到该 Group，或当前账户无法访问。"]
};

export class GitLabApiError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = "GitLabApiError";
    this.code = code;
    this.status = status;
  }
}

export function mapHttpError(status) {
  const [code, message] = ERROR_DETAILS[status] ?? ["API_ERROR", `GitLab API 请求失败（HTTP ${status}）。`];
  return new GitLabApiError(code, message, status);
}

async function getJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { credentials: "include", method: "GET" });
  } catch {
    throw new GitLabApiError("NETWORK_ERROR", "无法连接 GitLab，请检查网络后重试。");
  }
  if (!response.ok) throw mapHttpError(response.status);
  return { data: await response.json(), response };
}

export async function fetchCurrentUser(origin, fetchImpl = fetch) {
  return (await getJson(`${origin}/api/v4/user`, fetchImpl)).data;
}

export async function fetchGroup(origin, groupPath, fetchImpl = fetch) {
  const id = encodeURIComponent(groupPath);
  return (await getJson(`${origin}/api/v4/groups/${id}`, fetchImpl)).data;
}

export async function fetchAllGroupProjects(origin, groupPath, fetchImpl = fetch) {
  const projects = [];
  let page = "1";
  do {
    const id = encodeURIComponent(groupPath);
    const url = new URL(`${origin}/api/v4/groups/${id}/projects`);
    url.searchParams.set("include_subgroups", "true");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", page);
    const result = await getJson(url.toString(), fetchImpl);
    projects.push(...result.data);
    page = result.response.headers.get("x-next-page") || "";
  } while (page);
  return projects;
}
```

- [ ] **Step 4: Verify API tests pass**

Run: `node --test tests/gitlab-api.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/gitlab-api.js tests/gitlab-api.test.js
git commit -m "feat: scan paginated GitLab projects"
```

### Task 4: Background scan orchestration

**Files:**
- Create: `src/content/content-script.js`
- Create: `src/background/service-worker.js`

- [ ] **Step 1: Expose only the page location from the content script**

```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_PAGE_CONTEXT") return false;
  sendResponse({ url: window.location.href });
  return false;
});
```

- [ ] **Step 2: Implement active-tab lookup and message handling**

```js
import { parseGitLabGroupUrl } from "../core/gitlab-context.js";
import { fetchAllGroupProjects, fetchCurrentUser, fetchGroup } from "../core/gitlab-api.js";

async function scanActiveGroup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const page = tab?.id
    ? await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }).catch(() => null)
    : null;
  const context = parseGitLabGroupUrl(page?.url ?? "");
  if (!context) {
    return { ok: false, error: { code: "NOT_GROUP_PAGE", message: "请先打开一个 GitLab Group 页面。" } };
  }

  try {
    const [user, group, projects] = await Promise.all([
      fetchCurrentUser(context.origin),
      fetchGroup(context.origin, context.groupPath),
      fetchAllGroupProjects(context.origin, context.groupPath)
    ]);
    return { ok: true, data: { context, user, group, projects } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error.code ?? "UNKNOWN_ERROR",
        message: error.message ?? "扫描时发生未知错误。"
      }
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCAN_ACTIVE_GROUP") return false;
  scanActiveGroup().then(sendResponse);
  return true;
});
```

- [ ] **Step 3: Check syntax without executing Chrome APIs**

Run: `node --check src/content/content-script.js`
Expected: exit code 0.

Run: `node --check src/background/service-worker.js`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/content/content-script.js src/background/service-worker.js
git commit -m "feat: orchestrate active group scans"
```

### Task 5: Popup user interface

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`

- [ ] **Step 1: Add the accessible popup document**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>GitLab HookPilot</title>
    <link rel="stylesheet" href="popup.css">
  </head>
  <body>
    <main>
      <header><p class="eyebrow">GitLab HookPilot</p><h1>项目扫描</h1></header>
      <p id="status" role="status">打开 GitLab Group 页面后开始扫描。</p>
      <button id="scan" type="button">扫描当前 Group</button>
      <section id="summary" hidden><h2 id="group-name"></h2><p id="project-count"></p></section>
      <ul id="projects" aria-label="项目列表"></ul>
    </main>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Add popup behavior**

```js
const scanButton = document.querySelector("#scan");
const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const groupName = document.querySelector("#group-name");
const projectCount = document.querySelector("#project-count");
const projectList = document.querySelector("#projects");

function setBusy(busy) {
  scanButton.disabled = busy;
  scanButton.textContent = busy ? "正在扫描…" : "重新扫描";
}

function renderProjects(data) {
  summary.hidden = false;
  groupName.textContent = data.group.full_name ?? data.group.name;
  projectCount.textContent = `共发现 ${data.projects.length} 个项目`;
  projectList.replaceChildren(...data.projects.map((project) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = project.web_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = project.path_with_namespace ?? project.name;
    item.append(link);
    return item;
  }));
}

scanButton.addEventListener("click", async () => {
  setBusy(true);
  summary.hidden = true;
  projectList.replaceChildren();
  status.textContent = "正在验证登录状态并读取项目…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "SCAN_ACTIVE_GROUP" });
    if (!result?.ok) throw new Error(result?.error?.message ?? "扩展没有返回有效结果。");
    renderProjects(result.data);
    status.textContent = `已使用 ${result.data.user.name ?? result.data.user.username} 的权限完成扫描。`;
  } catch (error) {
    status.textContent = error.message;
    scanButton.textContent = "重试";
  } finally {
    setBusy(false);
  }
});
```

- [ ] **Step 3: Add compact styling**

```css
:root { color-scheme: light; font: 14px/1.5 system-ui, sans-serif; color: #1f1f23; background: #f7f7f8; }
body { margin: 0; min-width: 360px; max-width: 420px; }
main { padding: 20px; }
.eyebrow { margin: 0; color: #6b4fbb; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 2px 0 12px; font-size: 24px; }
h2 { margin: 18px 0 2px; font-size: 16px; }
#status { min-height: 42px; color: #55545b; }
button { width: 100%; border: 0; border-radius: 8px; padding: 10px 14px; color: white; background: #6b4fbb; font-weight: 700; cursor: pointer; }
button:disabled { cursor: wait; opacity: .65; }
ul { max-height: 320px; margin: 12px 0 0; padding: 0; overflow: auto; list-style: none; }
li { border-top: 1px solid #dedde3; padding: 9px 2px; }
a { color: #43308a; text-decoration: none; overflow-wrap: anywhere; }
a:hover { text-decoration: underline; }
```

- [ ] **Step 4: Validate scripts and references**

Run: `node --check src/popup/popup.js`
Expected: exit code 0.

Run: `test -f src/popup/popup.css`
Expected: exit code 0.

Run: `test -f src/popup/popup.html`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/popup
git commit -m "feat: display GitLab project scan results"
```

### Task 6: User README and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README for users**

Replace the unformatted draft with these sections and keep statements aligned with implementation status:

```markdown
# GitLab HookPilot

GitLab HookPilot 是用于扫描和批量管理 GitLab 项目 Webhook 的浏览器扩展，适合无法使用 Group Webhook 或 System Hook、需要维护大量项目的团队。

> 当前状态：只读 MVP。现阶段可以扫描 Group 与 Subgroup 项目，不会创建、更新或删除 Webhook。

## 当前功能

- 复用当前 GitLab 登录状态，无需 Personal Access Token
- 识别当前 Group 与 GitLab 实例
- 扫描 Group 和嵌套 Subgroup 中的项目
- 处理超过 100 个项目的 API 分页
- 显示项目列表及认证、权限、资源和网络错误

## 安装

1. 下载或克隆本仓库。
2. 在 Chrome 或 Edge 打开扩展管理页面并启用“开发者模式”。
3. 选择“加载已解压的扩展程序”，然后选择本项目目录。

## 使用

1. 登录 GitLab 并打开一个 Group 页面。
2. 点击 GitLab HookPilot 图标。
3. 点击“扫描当前 Group”。
4. 查看 Group、项目数量及项目列表。

## 权限与安全

扩展只使用当前浏览器中的 GitLab 会话，不读取或保存 Session Cookie。只读 MVP 仅调用 GitLab GET API，不会修改任何 Webhook，也不会将扫描结果发送给第三方。

## 浏览器支持

- Google Chrome
- Microsoft Edge
- 其他 Manifest V3 Chromium 浏览器

Firefox 尚未支持。

## 开发

运行自动化测试：

```bash
npm test
```

## 路线图

- 查询项目已有 Webhook
- 预览批量变更范围
- 批量创建缺失 Webhook
- 项目级进度、失败重试与结果导出
- 更新、删除及连通性测试

## 许可证与声明

本项目使用 MIT License。GitLab HookPilot 与 GitLab Inc. 不存在官方关联；GitLab 是 GitLab Inc. 的商标。
```

- [ ] **Step 2: Run all automated and static checks**

Run: `npm test`
Expected: all tests pass.

Run: `node --check src/content/content-script.js`
Expected: exit code 0.

Run: `node --check src/background/service-worker.js`
Expected: exit code 0.

Run: `node --check src/popup/popup.js`
Expected: exit code 0.

Run: `git diff --check`
Expected: no output.

- [ ] **Step 3: Perform manual browser acceptance**

Load the repository as an unpacked extension and verify:

1. A GitLab Group page returns a Group name and complete project list.
2. A non-Group page shows “请先打开一个 GitLab Group 页面”.
3. Signed-out or inaccessible Groups show the normalized authentication or permission message.
4. DevTools Network contains only GET requests during scanning.

- [ ] **Step 4: Commit documentation and any acceptance fixes**

```bash
git add README.md manifest.json src tests package.json
git commit -m "docs: publish HookPilot MVP usage guide"
```
