# Instance Project Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan every manageable membership project on the active GitLab instance, let users choose projects before preview/apply, and identify repositories in safe operation logs.

**Architecture:** Reduce URL parsing and scanning to an instance-only context. Add a small pure popup selection-state module so selection, filtering, tri-state state, and preview snapshots can be tested without a browser DOM. Pass selected projects into preview, and move operation-log decoration into a focused background helper that wraps GitLab writes without exposing secrets.

**Tech Stack:** Chrome Extension Manifest V3, browser ES modules, Node.js built-in test runner, GitHub Actions.

---

### Task 1: Make GitLab context and scanning instance-only

**Files:**
- Modify: `tests/gitlab-context.test.js`
- Modify: `tests/scan-active-group.test.js`
- Modify: `src/core/gitlab-context.js`
- Modify: `src/core/scan-group.js`

- [ ] **Step 1: Write failing context tests**

Replace path-specific expectations with assertions that group, subgroup, project, settings, dashboard, and explore URLs all return exactly `{ origin, scope: "instance" }`, while `chrome://` remains invalid.

```js
for (const path of [
  "/dashboard/projects",
  "/explore",
  "/groups/oss/xx/-/projects",
  "/oss/xx/project-a",
  "/oss/xx/project-a/-/settings/integrations"
]) {
  assert.deepEqual(parseGitLabGroupUrl(`https://gitlab.example.com${path}`), {
    origin: "https://gitlab.example.com",
    scope: "instance"
  });
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/gitlab-context.test.js tests/scan-active-group.test.js`

Expected: path-specific context tests fail because ordinary paths still produce `groupPath`/`projectPath` and fallback scan tests expect Group APIs.

- [ ] **Step 3: Implement minimal instance-only parsing and scan**

Make `parseGitLabGroupUrl` validate only URL syntax/protocol and return `{ origin: url.origin, scope: "instance" }`. Make `scanProjects` always call `fetchAllUserProjects`, filter access level >= 40, and return the synthetic current-account group label.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/gitlab-context.test.js tests/scan-active-group.test.js`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/gitlab-context.test.js tests/scan-active-group.test.js src/core/gitlab-context.js src/core/scan-group.js
git commit -m "feat: scan projects by GitLab instance"
```

### Task 2: Add pure project-selection state

**Files:**
- Create: `src/popup/project-selection.js`
- Create: `tests/project-selection.test.js`

- [ ] **Step 1: Write failing selection tests**

Cover fallback labels, default all-selected IDs, selected-project filtering, case-insensitive full-path search, tri-state selection, stable sorted snapshots, and snapshot equality.

```js
assert.deepEqual(createSelectedProjectIds(projects), new Set([1, 2, 3]));
assert.equal(getProjectLabel({ id: 9, name: "Runner" }), "Runner");
assert.deepEqual(filterProjects(projects, "STORAGE").map((p) => p.id), [1, 2]);
assert.deepEqual(getSelectionState(new Set([1]), 3), {
  checked: false,
  indeterminate: true,
  selectedCount: 1,
  totalCount: 3
});
assert.deepEqual(createProjectIdSnapshot(projects.slice(0, 2)), [1, 2]);
assert.equal(projectIdSnapshotsEqual([1, 2], [2, 1]), true);
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/project-selection.test.js`

Expected: FAIL because `src/popup/project-selection.js` does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Export `getProjectLabel`, `createSelectedProjectIds`, `getSelectedProjects`, `filterProjects`, `getSelectionState`, `createProjectIdSnapshot`, and `projectIdSnapshotsEqual`. Normalize IDs consistently as strings inside selection sets and snapshots to avoid number/string mismatches.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node --test tests/project-selection.test.js`

Expected: all selection tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/popup/project-selection.js tests/project-selection.test.js
git commit -m "feat: add project selection state"
```

### Task 3: Build selectable project UI and preview snapshot behavior

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup-view.js`
- Modify: `tests/popup-view.test.js`
- Create: `tests/popup-selection-flow.test.js`

- [ ] **Step 1: Write failing view and flow tests**

Update scan-view expectations to use the full Repo label/fallback. Add pure flow assertions that selected projects are the only projects in a preview request, empty selection yields `请至少选择一个项目。`, invalidation clears preview state, and changed snapshots reject apply with `项目选择已变更，请重新预览。`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/popup-view.test.js tests/popup-selection-flow.test.js`

Expected: FAIL because the selection-flow helpers and UI behavior do not exist.

- [ ] **Step 3: Add popup controls and state transitions**

Add `#project-controls`, `#select-all`, `#selected-count`, `#project-search`, and `#preview-selected`. Render checkbox rows with Repo links. On scan, initialize all IDs selected and do not auto-preview. On selection change, update tri-state/count, rerender filtered rows, and invalidate a previous preview. On preview, pass `{ type: "PREVIEW_WEBHOOK_CHANGES", projects: selectedProjects, config }` and store a sorted ID snapshot. Before apply, compare current selection to the snapshot and stop on mismatch or empty selection.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/popup-view.test.js tests/popup-selection-flow.test.js`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/popup tests/popup-view.test.js tests/popup-selection-flow.test.js
git commit -m "feat: select projects before webhook preview"
```

### Task 4: Preview exactly the selected projects

**Files:**
- Modify: `src/background/service-worker.js`
- Create: `src/background/preview-request.js`
- Create: `tests/preview-request.test.js`

- [ ] **Step 1: Write failing background preview tests**

Assert that `previewWebhookChangesForProjects(projects, config, origin, api)` calls `buildWebhookPreview` behavior only for the supplied project IDs and rejects an empty list with `NO_PROJECTS_SELECTED` and the required Chinese message.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/preview-request.test.js`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement selected-project preview routing**

Create the focused helper and update the service worker message handler to receive `message.projects`. The worker still gets the active page to obtain/validate origin context, but must not rescan projects during preview. It validates the active origin using `/api/v4/user`, then builds the preview for only the supplied projects.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node --test tests/preview-request.test.js tests/webhook-plan.test.js`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.js src/background/preview-request.js tests/preview-request.test.js
git commit -m "feat: preview selected GitLab projects"
```

### Task 5: Add Repo-aware, secret-safe operation logs

**Files:**
- Create: `src/background/webhook-operation-api.js`
- Create: `tests/webhook-operation-api.test.js`
- Modify: `src/background/service-worker.js`
- Modify: `tests/webhook-plan.test.js`

- [ ] **Step 1: Write failing operation-log tests**

Cover create request/success/failure and update request/success/failure. Assert every entry contains `project`, `projectId`, and applicable `hookId`; failures include status/error; JSON-stringified details never contain the literal secret. Also retain a plan test where one project fails and another succeeds.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/webhook-operation-api.test.js tests/webhook-plan.test.js`

Expected: FAIL because Repo-aware wrappers do not exist.

- [ ] **Step 3: Implement logging wrapper**

Export a factory receiving `{ items, csrfToken, api, fetchImpl, logOperation }`. Build the ID-to-label map, sanitize payloads to URL/event flags plus `hasToken`, wrap create/update in try/catch, and emit request then success/failed entries before returning or rethrowing. Use returned hook IDs for create success and input hook IDs for update entries.

- [ ] **Step 4: Integrate wrapper and verify GREEN**

Replace inline service-worker wrappers with the tested factory. Run:

`node --test tests/webhook-operation-api.test.js tests/webhook-plan.test.js`

Expected: all focused tests pass and no logged value contains a Secret Token.

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.js src/background/webhook-operation-api.js tests/webhook-operation-api.test.js tests/webhook-plan.test.js
git commit -m "feat: identify repositories in webhook logs"
```

### Task 6: Verify extension and prepare rebuilt v1.0.0

**Files:**
- Modify if needed: `README.md`
- Verify: `package.json`
- Verify: `manifest.json`

- [ ] **Step 1: Update user documentation**

Document instance-wide scanning, Maintainer/Owner filtering, selection/search behavior, preview invalidation, and Repo-aware safe logs without changing version `1.0.0`.

- [ ] **Step 2: Run complete verification**

Run `npm test`, `git diff --check`, the workflow's manifest required-file validation script, and the workflow-equivalent ZIP command into `/tmp/gitlab-hook-pilot-v1.0.0.zip`.

Expected: zero test failures, no whitespace errors, no missing extension files, and a valid ZIP containing `manifest.json`, `src`, `assets`, `README.md`, and `LICENSE`.

- [ ] **Step 3: Review acceptance criteria and secrets**

Search production/logging code for token serialization and compare every design acceptance criterion to an automated test or explicit package check.

- [ ] **Step 4: Commit final documentation**

```bash
git add README.md
git commit -m "docs: explain project selection workflow"
```

- [ ] **Step 5: Rebuild the public release after final confirmation**

Push `main`, delete the GitHub `v1.0.0` Release, delete local and remote `v1.0.0` tags, recreate annotated `v1.0.0` on the verified commit, push it, and monitor the tag-triggered GitHub Actions workflow until completion. Confirm the recreated Release contains `gitlab-hook-pilot-v1.0.0.zip` built from the new tag.
