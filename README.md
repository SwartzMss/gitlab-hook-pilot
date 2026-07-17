# Webhook 一键配置

Webhook 一键配置是用于批量管理 GitLab 项目 Comments Webhook 的浏览器扩展，适合需要为多个项目统一配置评论事件回调的团队。

> **当前状态：Webhook 预览与创建/更新版本。** 现阶段可以扫描当前 GitLab 中有 Webhook 管理权限的项目，并在用户确认后创建或更新项目 Webhook。

## 为什么需要 HookPilot

当一个 GitLab Group 包含几十个甚至数百个项目时，逐个进入项目配置 Webhook 十分耗时。HookPilot 计划提供一个统一界面，让具备权限的用户检查项目配置，并批量补充缺失的项目级 Webhook。

它主要面向以下场景：

- GitLab 版本不支持 Group Webhook
- 当前账户无法配置 Group Webhook 或 System Hook
- 项目分布在多个嵌套 Subgroup
- 需要为大量现有项目补充相同的 Webhook
- 需要检查不同项目间的 Webhook 配置差异

HookPilot 不负责接收 Webhook 事件。GitLab 仍会将事件发送到用户配置的后端服务。

## 当前功能

- 复用当前 GitLab 登录状态，无需 Personal Access Token
- 识别当前 GitLab 实例与 Group 路径
- 扫描当前账号具备 Maintainer 或 Owner 权限的项目
- 自动处理超过 100 个项目的 GitLab API 分页
- 显示 Group、项目数量及项目列表
- 输入 Webhook URL 和 Secret Token
- 默认启用 Comments 事件，也可以选择其他常用事件
- 预览每个项目将创建、更新或跳过的 Webhook 操作
- 确认后批量创建缺失 Webhook，或更新所有精确 URL 匹配的 Webhook
- 保留界面暂未管理的已有 Hook 事件字段，避免更新时意外关闭
- 区分登录失效、权限不足、资源不存在和网络错误
- 自动跳过权限不足的项目
- 单个项目查询或写入失败不会中断其他项目

## 安装

当前版本尚未发布到浏览器扩展商店，需要以开发模式加载：

1. 下载或克隆本仓库。
2. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。
3. 启用“开发者模式”。
4. 选择“加载已解压的扩展程序”。
5. 选择本项目的根目录。

## 使用方法

1. 在浏览器中登录 GitLab。
2. 打开任意 GitLab 页面。
3. 点击浏览器工具栏中的“Webhook 一键配置”图标。
4. 点击“检查可配置项目”。
5. 查看项目总数、项目列表和自动生成的 Webhook 变更预览。
6. 点击“确认执行”后批量写入。

扫描和自动预览阶段不会修改项目配置；只有点击“确认执行”后才会写入 Webhook。如果缺少 Webhook URL 或 Secret Token，Popup 会提示先打开设置填写。

## Webhook 写入行为

当前版本只会创建或更新项目 Webhook，不会删除任何已有 Webhook。

- 没有精确匹配目标 URL 的项目：调用 `POST /api/v4/projects/:id/hooks` 新增一个 Webhook。
- 有一个精确匹配目标 URL 的项目：调用 `PUT /api/v4/projects/:id/hooks/:hook_id` 更新该 Webhook。
- 有多个精确匹配目标 URL 的项目：逐个更新所有匹配 Webhook。
- URL 不匹配的已有 Webhook：保持不变。
- 查询失败的项目：不进入写入队列。

只有 URL 完全相同的 Webhook 会被更新；其他已有 Webhook 保持不变。

## 设置与日志

右键点击浏览器工具栏中的“Webhook 一键配置”图标，选择“选项”，可以保存默认 Webhook URL 和 Secret Token。

Popup 底部会显示本次操作日志，包括扫描、预览和执行的开始、完成与错误摘要。更详细的后台日志可以在扩展管理页打开 GitLab HookPilot 的 service worker DevTools 查看，日志前缀为 `[GitLab HookPilot]`。

## 权限与认证

HookPilot 使用浏览器中现有的 GitLab 登录会话调用 GitLab REST API：

- 不要求用户创建或输入 Personal Access Token
- 不读取、导出或持久化 GitLab Session Cookie
- 写入请求会复用当前页面的 CSRF Token；如果页面未提供 Token，则由 GitLab 返回明确错误
- 所有结果受当前 GitLab 用户权限限制
- 无权访问的 Group 或项目可能返回 `403` 或 `404`
- 会话失效后需要先重新登录 GitLab

为了支持任意自托管 GitLab 地址，开发版需要申请 HTTP 与 HTTPS 站点访问权限。扩展只会根据当前 Group 页面识别出的实例地址发出 API 请求。

## 安全原则

- Webhook URL 和 Secret Token 保存在浏览器扩展本地存储中
- 预览阶段仅调用 GitLab GET API
- 写入阶段仅调用项目 Webhook 的 POST 和 PUT API，不执行 DELETE
- 不向第三方服务发送扫描结果
- 不记录 Cookie、认证请求头或其他登录信息
- 不在浏览器本地保存项目扫描结果
- 覆盖匹配 Webhook 前必须展示变更范围并要求用户确认

## 浏览器支持

首个版本面向 Manifest V3 Chromium 浏览器：

- Google Chrome
- Microsoft Edge
- 其他 Chromium 内核浏览器

Firefox 尚未支持。

## 开发

本项目使用原生 HTML、CSS 和 JavaScript，不需要打包工具或第三方运行时依赖。

### 项目结构

```text
gitlab-hook-pilot/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   └── content-script.js
│   ├── core/
│   │   ├── gitlab-api.js
│   │   ├── gitlab-context.js
│   │   └── scan-group.js
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       ├── popup.js
│       └── popup-view.js
├── tests/
├── package.json
└── README.md
```

### 运行测试

需要 Node.js 20 或更高版本：

```bash
npm test
```

测试覆盖 Group URL 识别、API 错误映射、项目分页、Webhook 配置校验、精确 URL 匹配、预览计划、写入执行和 Popup 状态数据。

## 贡献

欢迎提交 Issue、功能建议和 Pull Request。提交代码前请确保：

- 仓库中不包含账号、Cookie、Token 或真实 Webhook Secret
- 新功能包含明确的错误处理和相应测试
- 单个项目失败不会中断整个批量任务
- 涉及敏感权限的修改同步更新安全说明

## 许可证与声明

本项目使用 [MIT License](LICENSE)。

GitLab HookPilot 是独立的开源项目，与 GitLab Inc. 不存在官方关联。GitLab 是 GitLab Inc. 的商标。
