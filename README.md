# GitLab HookPilot

GitLab HookPilot 是用于扫描和批量管理 GitLab 项目 Webhook 的浏览器扩展，适合无法使用 Group Webhook 或 System Hook、需要维护大量项目的团队。

> **当前状态：只读 MVP。** 现阶段可以扫描 Group 与嵌套 Subgroup 中的项目，不会创建、更新或删除 Webhook。

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
- 扫描 Group 和嵌套 Subgroup 中用户可见的项目
- 自动处理超过 100 个项目的 GitLab API 分页
- 显示 Group、项目数量及项目列表
- 区分登录失效、权限不足、资源不存在和网络错误
- 扫描过程仅发送只读 GET 请求

## 安装

当前版本尚未发布到浏览器扩展商店，需要以开发模式加载：

1. 下载或克隆本仓库。
2. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。
3. 启用“开发者模式”。
4. 选择“加载已解压的扩展程序”。
5. 选择本项目的根目录。

## 使用方法

1. 在浏览器中登录 GitLab。
2. 打开一个 Group 页面，例如 `https://gitlab.example.com/groups/platform/-/activity`。
3. 点击浏览器工具栏中的 GitLab HookPilot 图标。
4. 点击“扫描当前 Group”。
5. 查看 Group 名称、项目总数和项目列表。

扫描会包含嵌套 Subgroup 中用户可见的项目。当前版本不会修改任何项目配置。

## 权限与认证

HookPilot 使用浏览器中现有的 GitLab 登录会话调用 GitLab REST API：

- 不要求用户创建或输入 Personal Access Token
- 不读取、导出或持久化 GitLab Session Cookie
- 所有结果受当前 GitLab 用户权限限制
- 无权访问的 Group 或项目可能返回 `403` 或 `404`
- 会话失效后需要先重新登录 GitLab

为了支持任意自托管 GitLab 地址，开发版需要申请 HTTP 与 HTTPS 站点访问权限。扩展只会根据当前 Group 页面识别出的实例地址发出 API 请求。

## 安全原则

- 只读 MVP 仅调用 GitLab GET API
- 不向第三方服务发送扫描结果
- 不记录 Cookie、认证请求头或其他登录信息
- 不在浏览器本地保存项目扫描结果
- 后续写入功能必须先展示变更范围
- 覆盖或删除 Webhook 前必须再次要求用户确认

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

测试覆盖 Group URL 识别、API 错误映射、项目分页、扫描流程和 Popup 状态数据。

## 开发路线图

### 第一阶段：只读扫描（当前版本）

- [x] Manifest V3 基础结构
- [x] 识别 GitLab Group 页面
- [x] 验证当前登录状态
- [x] 扫描 Group 与 Subgroup 项目
- [x] 处理 GitLab API 分页
- [x] 显示项目列表和错误信息

### 第二阶段：Webhook 检查与创建

- [ ] 查询每个项目已有的 Webhook
- [ ] 检测目标 Webhook URL 是否存在
- [ ] 输入 Webhook URL、Secret 和事件配置
- [ ] 在写入前预览变更范围
- [ ] 批量创建缺失的 Webhook
- [ ] 显示项目级进度与结果

首批计划支持 Merge Request 与 Note 事件。

### 第三阶段：维护与修复

- [ ] 更新已有 Webhook
- [ ] 批量删除 Webhook
- [ ] 测试 Webhook 连通性
- [ ] 重试失败项目
- [ ] 导出执行结果
- [ ] 检查项目间的 Webhook 配置一致性

## 贡献

欢迎提交 Issue、功能建议和 Pull Request。提交代码前请确保：

- 仓库中不包含账号、Cookie、Token 或真实 Webhook Secret
- 新功能包含明确的错误处理和相应测试
- 单个项目失败不会中断整个批量任务
- 涉及敏感权限的修改同步更新安全说明

## 许可证与声明

本项目使用 [MIT License](LICENSE)。

GitLab HookPilot 是独立的开源项目，与 GitLab Inc. 不存在官方关联。GitLab 是 GitLab Inc. 的商标。
