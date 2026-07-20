# GitLab 實例項目選擇與操作日誌設計

## 目標

HookPilot 在當前已登入 GitLab 實例的任意 HTTP(S) 頁面上，掃描目前使用者全部具備 Maintainer 或 Owner 權限的 membership 項目。使用者可搜尋並選擇要處理的項目，預覽與執行僅作用於已選項目；Webhook 操作日誌同時提供完整 Repo 路徑與 API 識別碼。

## 實例識別與掃描

頁面上下文只包含：

```js
{
  origin: "https://gitlab.example.com",
  scope: "instance"
}
```

CSRF Token 繼續由 content script 擷取並在 Webhook 寫入時傳給 GitLab。普通 URL 不再推斷 `groupPath` 或 `projectPath`，避免多級 Subgroup 與 Project 路徑歧義。

掃描順序固定為：

1. 從當前頁面取得 HTTP(S) origin 與 CSRF Token。
2. 呼叫 `GET /api/v4/user` 驗證目前站點是已登入的 GitLab 實例。
3. 分頁呼叫 `GET /api/v4/projects?membership=true&per_page=100&page=N`。
4. 保留 `project_access` 或 `group_access` 最高權限不低於 40 的項目。

掃描不再呼叫 Group 或單一 Project API，也不以當前頁面路徑限制結果。

## 項目選擇介面

Popup 在掃描後保存：

```js
let scannedProjects = [];
let selectedProjectIds = new Set();
let latestPreview = null;
let latestPreviewProjectIds = [];
```

所有掃描結果預設選中。列表名稱優先使用 `path_with_namespace`，其次使用 `name`，最後使用 `project-${id}`。介面包含：

- 全選控制，可呈現 checked、indeterminate 與 unchecked。
- `已選擇 N / M` 統計。
- 依完整 Repo 路徑、不區分大小寫的搜尋欄位。
- 每個項目的獨立複選框與 Repo 連結。
- 明確的「預覽選中項目」按鈕。

搜尋只改變可見列表，不改變任何選擇；全選與取消全選作用於全部掃描項目，而非僅搜尋結果。

## 預覽與執行一致性

掃描完成後不自動查詢 Webhook。使用者點擊預覽時，Popup 取得當前選中項目並連同 Webhook 設定傳給背景程序。背景程序使用這批項目建立預覽，不重新掃描頁面。

未選中項目時禁止預覽並顯示「請至少選擇一個項目。」。任何項目選擇變更都立即：

- 清除 `latestPreview` 與 `latestPreviewProjectIds`。
- 隱藏執行按鈕與舊預覽內容。
- 提示「項目選擇已變更，請重新預覽。」（僅在已有預覽時）。

預覽成功後保存排序過的項目 ID 快照。執行前重新取得並排序目前選中的 ID；若與快照不同，停止寫入並提示重新預覽。執行消息仍攜帶預覽項目，確保實際寫入內容與畫面確認內容一致。

## 操作日誌

背景執行程序從計畫項目建立 Project ID 到 Repo 名稱的映射：

```js
const projectNames = new Map(
  items.map((item) => [
    String(item.project.id),
    item.project.path_with_namespace
      ?? item.project.name
      ?? `project-${item.project.id}`
  ])
);
```

建立與更新操作的 request、success、failed 日誌均包含：

- `project`：完整 Repo 路徑或可靠 fallback。
- `projectId`：GitLab Project ID。
- `hookId`：更新操作及建立成功回應可取得時記錄。
- 安全化後的 Webhook URL、事件與非敏感設定。
- 失敗狀態及公開錯誤訊息。

日誌不得包含 Secret Token 本身；只允許 `hasToken` 之類的布林資訊。下載日誌合併 Popup 與背景日誌時仍遵守此限制。

## 錯誤處理與並行性

預覽與執行沿用有界並行映射。每個項目的查詢或寫入錯誤轉換為該項目的失敗結果，不使其他項目停止。更新同一項目的多個匹配 Hook 時，逐一記錄成功或失敗，並保留部分成功狀態。

登入失效、站點不是 GitLab、缺少 Webhook URL、空選擇、預覽快照失效與背景消息錯誤均以使用者可操作的中文訊息呈現。

## 測試策略

自動測試覆蓋：

- 所有 HTTP(S) GitLab 路徑只解析成 instance context，非 HTTP(S) URL 被拒絕。
- 掃描永遠使用 membership API 並正確篩選 Maintainer/Owner。
- 項目顯示名稱、搜尋、選擇、全選與半選狀態的純函數。
- 空選擇禁止預覽，預覽只收到所選項目。
- 選擇變更使預覽失效，執行前快照不一致時拒絕寫入。
- 建立與更新的成功/失敗日誌包含 Repo 路徑、Project ID 及適用的 Hook ID。
- Secret Token 不出現在安全化 payload 或下載日誌資料。
- 單項失敗不影響其他項目完成。

完整驗證包含 `npm test`、擴充套件必要檔案檢查與 ZIP 打包。

## 發佈

功能提交並通過完整驗證後，將 `package.json` 與 `manifest.json` 保持為 `1.0.0`。刪除現有 GitHub `v1.0.0` Release 與本地/遠端標籤，於新的功能提交建立同名標籤並推送，觸發 GitHub Actions 重建 `gitlab-hook-pilot-v1.0.0.zip` 並重新建立 Release。

刪除 Release 與移動公開標籤屬於歷史改寫；執行前必須再次確認目標提交已通過測試與打包驗證。
