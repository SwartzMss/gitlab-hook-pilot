# GitLab HookPilot MVP 设计

## 目标

GitLab HookPilot 是一款基于 Manifest V3 的 Chromium 浏览器扩展，帮助用户扫描 GitLab Group 及其 Subgroup 中的项目，并最终批量检查和管理项目级 Webhook。

本阶段交付一个可运行但只读的 MVP，用于验证 GitLab 页面识别、会话认证、Group 项目扫描、API 分页和错误反馈。MVP 不创建、更新或删除 Webhook。

## 面向用户的 README

README 以最终使用者为主要读者，并按照产品完成后的使用方式编写。内容包括：

- 产品用途与适用场景
- 核心能力和限制
- 安装及使用流程
- 登录、权限与安全模型
- 支持的浏览器和 GitLab 环境
- 明确区分当前 MVP 与后续功能的路线图
- 开发和贡献说明

README 不把尚未实现的功能描述为当前可用功能；这些功能必须标记为“开发目标”或列入路线图。

## MVP 范围

### 包含

1. 提供可加载到 Chrome、Edge 等 Chromium 浏览器的 Manifest V3 扩展结构。
2. 从当前标签页识别 GitLab 实例地址和 Group 路径。
3. 检查当前页面是否适合执行 Group 扫描。
4. 复用浏览器已有的 GitLab 登录会话调用 REST API。
5. 获取当前用户和 Group 信息。
6. 扫描 Group 及嵌套 Subgroup 中用户可见的项目。
7. 正确处理每页最多 100 条记录的 GitLab API 分页。
8. 在 Popup 中显示加载状态、项目总数、项目列表和错误信息。
9. 区分未登录、非 Group 页面、权限不足、资源不存在、网络失败和 API 返回异常。

### 不包含

- 创建、更新、删除或测试 Webhook
- 输入或保存 Webhook URL、Secret 与事件配置
- Personal Access Token 认证
- Firefox 支持
- 自动定时扫描
- 执行结果导出

## 技术设计

扩展使用原生 HTML、CSS 和 JavaScript，不引入框架或打包工具。

### 组件

- `manifest.json`：声明 Manifest V3、Popup、service worker、必要权限及 GitLab 主机访问策略。
- `src/popup/`：显示当前页面、扫描进度、项目列表和错误状态，并接收用户发起的扫描操作。
- `src/background/service-worker.js`：协调当前标签页识别和扫描请求。
- `src/content/content-script.js`：读取当前 GitLab 页面上下文；仅提取实例地址、Group 路径和必要的页面元数据。
- `src/api/gitlab-api.js`：封装用户查询、Group 查询、项目分页扫描和统一 API 错误。
- `src/utils/`：包含 GitLab URL、Group 路径与分页响应的可独立测试逻辑。
- `tests/`：使用 Node 内置测试运行器验证纯逻辑模块。

### 数据流

1. 用户在 GitLab Group 页面打开扩展。
2. Popup 请求当前标签页信息。
3. 扩展解析 GitLab 实例地址和 Group 路径；无法识别时停止并显示说明。
4. API 模块使用 `credentials: "include"` 请求当前用户和 Group。
5. API 模块以 `include_subgroups=true` 和 `per_page=100` 扫描项目，并持续读取下一页，直到没有后续页面。
6. Popup 显示扫描结果。MVP 不发送任何写入 GitLab 的请求。

## 认证与权限

MVP 复用当前浏览器的 GitLab 会话，不要求 Personal Access Token，也不读取、保存或导出 Cookie。所有请求均受当前登录用户的 GitLab 权限约束。

只读 MVP 不需要 CSRF Token。后续加入 POST、PUT 或 DELETE 操作时，必须单独设计 CSRF、变更预览和用户确认流程。

## 错误处理

用户界面提供可理解且可操作的错误信息：

- `401`：登录状态无效，提示重新登录 GitLab。
- `403`：当前账户无权读取目标 Group 或项目。
- `404`：Group 不存在、不可见或页面路径无法映射到 API 资源。
- 网络错误：提示检查 GitLab 连通性后重试。
- 非预期响应：显示简短错误摘要，不输出 Cookie、认证头或其他敏感信息。

单页或单次请求失败会终止本次只读扫描并保留已经获得的上下文；界面不得显示不完整结果为成功结果。

## 安全约束

- 不读取或持久化 GitLab Session Cookie。
- 不记录认证请求头或敏感页面数据。
- 只向当前识别出的 GitLab 实例发送请求。
- 权限限制到 MVP 所需的最小集合。
- MVP 仅执行 GET 请求。
- 不把扫描数据发送到第三方服务。

## 测试与验收

自动化测试至少覆盖：

- GitLab Group URL 和嵌套 Group 路径解析
- 非 Group 页面拒绝逻辑
- API 分页终止与多页合并
- HTTP 状态到用户错误类型的映射

人工验收标准：

1. 扩展可以通过 Chromium 的“加载已解压的扩展程序”成功加载。
2. 在已登录且有权限的 GitLab Group 页面，可以扫描并显示包含 Subgroup 的项目。
3. 超过 100 个项目时，结果数量不被第一页截断。
4. 在非 Group 页面、退出登录或权限不足时，界面显示对应错误，不发生未处理异常。
5. 扫描期间不会向 GitLab 发送 POST、PUT、PATCH 或 DELETE 请求。

## 后续阶段

完成只读 MVP 后，按以下顺序扩展：

1. 查询项目已有 Webhook，并检查指定 URL 是否存在。
2. 提供 Webhook URL、Secret 和事件选择界面。
3. 在写入前显示项目范围和变更预览。
4. 批量创建缺失的 Webhook，并提供项目级进度与结果。
5. 加入失败重试、更新、删除、连通性测试及结果导出。

所有写入阶段必须保持单个项目失败不会中断其他项目，并在覆盖或删除前要求用户明确确认。
