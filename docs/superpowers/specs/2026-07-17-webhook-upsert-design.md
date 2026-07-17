# GitLab HookPilot Webhook 更新或创建设计

## 目标

在现有只读项目扫描 MVP 上增加 Webhook 配置、预览和批量写入能力。用户提供一个目标 Webhook 配置后，扩展在每个项目中使用 URL 精确匹配已有 Webhook：存在匹配项时完整更新，不存在时创建新项。

本阶段不执行删除操作。URL 不匹配的已有 Webhook 必须保持不变。

## 扫描入口

用户不必必须打开 Group 页面。扩展根据当前 GitLab 页面决定扫描范围：

1. Group 页面：扫描该 Group 及其嵌套 Subgroup 项目。
2. 项目页面：优先扫描项目所在 namespace 对应的 Group；如果 namespace 不是 Group，则只扫描当前项目。
3. 普通 GitLab 页面：扫描当前账号参与的项目，调用 `/api/v4/projects?membership=true`。

所有 API 请求只发送到当前页面识别出的 GitLab 实例 origin。

## 配置项

Popup 提供以下配置：

- Webhook URL：必填，必须是有效的 HTTP 或 HTTPS URL。
- Secret Token：必填，可在 Popup 或 Options 中填写；与 Webhook URL 一起保存在 `chrome.storage.local`，但不得写入日志。
- 事件类型：固定启用 Comments，对应 GitLab API 的 `note_events`。
- SSL verification：固定关闭，界面不提供配置项。

后续事件类型可以扩展 Merge Request、Push、Tag Push、Pipeline、Job、Deployment 和 Release，但不属于本阶段范围。

## URL 匹配规则

Webhook URL 使用字符串精确相等进行匹配：

```js
existingHook.url === configuredUrl
```

匹配前不做任何规范化，包括：

- 不移除前后空白
- 不转换协议或域名大小写
- 不增删末尾斜线
- 不调整路径、端口、Query String 或 Fragment

输入验证会拒绝前后含空白的 URL，但不会在用户不知情的情况下自动修改输入值。

## 每个项目的决策规则

1. 调用 `GET /api/v4/projects/:id/hooks` 获取项目 Webhook。
2. 筛选所有 `hook.url === configuredUrl` 的匹配项。
3. 没有匹配项时，将项目标记为“待创建”。
4. 存在一个匹配项时，将该 Webhook 标记为“待更新”。
5. 存在多个匹配项时，将所有匹配项标记为“待更新”。
6. URL 不匹配的其他 Webhook 保持不变。

GitLab API 不提供可用于比较的现有 Secret Token，因此即使事件和 SSL 设置表面一致，精确 URL 匹配项仍一律更新并覆盖 Secret。本阶段不提供“已一致并跳过”的判断。

## 预览与确认

写入前必须完成只读预览，显示：

- 扫描项目总数
- 待创建项目数
- 待更新项目数与待更新 Webhook 数
- 查询失败项目数
- 各项目将执行的动作

查询失败的项目不进入写入队列。用户必须明确点击确认按钮后才开始创建或更新；关闭 Popup 或取消操作不会产生写入。

## 写入行为

### 创建

对没有精确匹配项的项目调用：

```text
POST /api/v4/projects/:id/hooks
```

### 更新

对每个精确匹配项调用：

```text
PUT /api/v4/projects/:id/hooks/:hook_id
```

创建与更新均发送完整目标配置：

- `url`
- `token`
- `note_events`
- `enable_ssl_verification`

Comments 固定发送 `note_events: true`，Merge Request 固定发送 `merge_requests_events: false`。当前目标是 Comments-only，因此常见非 Comments 事件会在创建和更新时显式发送 `false`。

Push events 固定关闭，发送 `push_events: false`、空的 `push_events_branch_filter` 和 `branch_filter_strategy: "wildcard"`，避免 GitLab 默认启用 Push events。

## 执行模型

- 项目按有限并发执行，默认最多同时处理 5 个项目。
- 单个项目或单个重复 Hook 更新失败不会中断其他项目。
- 同一项目内的多个匹配 Hook 逐个更新并分别记录结果。
- 不自动重试写入请求，避免不明确的重复操作；失败项可以由用户手动重试。
- 本阶段不执行 DELETE。

## 结果状态

每个项目最终显示以下状态之一：

- 创建成功
- 更新成功
- 部分更新成功：同一项目多个匹配 Hook 中仅部分成功
- 权限不足
- 认证失效
- 查询失败
- 写入失败

汇总显示成功、部分成功和失败数量，并保留项目级错误摘要。错误信息不得包含 Secret Token、Cookie 或认证请求头。

## 认证与 CSRF

扩展继续复用当前浏览器 GitLab 会话，不使用 Personal Access Token。写入请求使用 `credentials: "include"`。

扩展从当前 GitLab 页面的 `meta[name="csrf-token"]` 读取 CSRF Token；存在时为 POST 与 PUT 请求添加 `X-CSRF-Token` 请求头，不存在时仍发起请求，由 GitLab 返回明确的认证结果。Token 不会被持久化。认证或 CSRF 失败时停止对应项目写入并显示明确错误，人工验收需要覆盖目标 GitLab 实例的实际行为。

## 安全约束

- Secret Token 可保存到 `chrome.storage.local`，与 Webhook URL 同等处理。
- 不将 Secret Token 写入日志、错误对象或执行结果。
- 写入前展示影响范围并要求确认。
- 仅操作当前扫描实例与 Group 中的项目。
- 不修改 URL 不匹配的 Webhook。
- 不执行批量删除。
- Popup 关闭后清除当前配置与预览。

## 自动化测试

测试至少覆盖：

- 配置必填项和 URL 验证
- URL 字符串精确匹配，包括大小写、末尾斜线和 Query String 差异
- 零个、一个和多个匹配项的执行计划
- 匹配项始终进入更新队列
- 创建和更新时 Push events 保持关闭
- POST 与 PUT 请求体字段映射
- HTTP 错误分类且错误内容不泄露 Secret
- 有限并发下单个项目失败不影响其他项目
- 部分更新成功状态

## 人工验收

1. 配置不完整时无法进入预览。
2. 预览阶段只发送 GET 请求。
3. 取消或关闭 Popup 不会写入。
4. 确认后，无匹配 URL 的项目创建一个 Webhook。
5. 确认后，精确匹配 URL 的所有 Webhook 均被目标配置覆盖。
6. 仅大小写、末尾斜线或 Query String 不同的 URL 不会被更新。
7. URL 不匹配的 Webhook 保持不变。
8. Secret 不出现在存储、日志或结果界面中。
9. 一个项目失败时，其他项目继续执行并得到独立结果。

## 不在本阶段范围内

- 删除 Webhook
- 自动定时同步
- 后台持久化任务
- 将 Secret Token 发送到第三方服务
- 结果导出
- Webhook 连通性测试
- 自动重试
- Firefox 支持
