GitLab HookPilot一个用于批量扫描和管理 GitLab 项目 Webhook 的浏览器扩展。GitLab HookPilot 面向需要维护大量 GitLab 项目的团队。特别适用于无法使用 Group Webhook 或 System Hook，只能逐个配置项目级 Webhook 的场景。扩展会复用用户当前已经登录的 GitLab 会话，让具备相应权限的用户在统一界面中批量配置多个项目的 Webhook。为什么需要 GitLab HookPilot？当一个 GitLab Group 中包含几十个甚至几百个项目时，逐个进入项目配置 Webhook 会非常繁琐。GitLab HookPilot 计划提供以下能力：扫描 Group 下的所有项目批量创建项目 Webhook自动检测已经存在的 Webhook按项目展示执行结果重试配置失败的项目无须额外输入 Personal Access Token统一管理大量 GitLab 项目的 Webhook 配置计划功能自动识别当前 GitLab 实例地址自动识别当前 Group 或 Subgroup扫描 Group 下的全部项目支持扫描嵌套 Subgroup 中的项目为缺少配置的项目创建 Webhook检测已经存在的 Webhook URL更新已有 Webhook 配置批量删除 Webhook测试 Webhook 连通性重试失败项目导出失败项目列表展示权限、认证和接口错误将扩展设置保存在浏览器本地批量检查项目 Webhook 配置一致性支持的 Webhook 事件首个版本计划优先支持：Merge Request 事件Comment 和 Note 事件后续可能增加：Push 事件Tag Push 事件Pipeline 事件Job 事件Deployment 事件Release 事件工作原理GitLab Group 页面
        │
        ▼
GitLab HookPilot 浏览器扩展
        │
        ├── 识别 GitLab 实例
        ├── 获取当前 Group
        ├── 扫描 Group 下的项目
        ├── 查询已有项目 Webhook
        ├── 创建或更新 Webhook
        └── 展示批量执行结果
                │
                ▼
          GitLab REST API
GitLab HookPilot 本身不负责接收 Webhook 事件。GitLab 仍然会将 Webhook 事件发送到用户配置的后端服务，例如 GitLabWorkRunner。GitLab 项目
     │
     ▼
配置的 Webhook URL
     │
     ▼
GitLabWorkRunner
或其他 Webhook 接收服务
身份认证GitLab HookPilot 计划直接复用用户当前浏览器中的 GitLab 登录状态。用户无须额外创建、输入或保存 GitLab Personal Access Token。扩展执行的所有操作，都受当前登录用户权限限制。这意味着：Maintainer 或 Owner 通常可以管理项目 WebhookDeveloper 可能收到权限不足错误无权访问的项目可能返回 403 或 404GitLab 会话过期后，需要用户重新登录扩展无法绕过 GitLab 自身的权限控制GitLab HookPilot 不会提升用户权限，也不会绕过 GitLab 的权限模型。使用流程登录 GitLab。打开一个 GitLab Group 页面。打开 GitLab HookPilot 扩展。输入 Webhook 地址。输入 Webhook Secret。选择需要启用的 Webhook 事件。扫描当前 Group 下的项目。检查待配置的项目列表。开始批量配置。查看成功、失败和权限不足的项目。对失败项目进行重试或导出。执行结果示例：扫描项目：126

创建成功：       93
已经存在：       18
权限不足：       12
执行失败：        3
项目结构计划采用以下项目结构：gitlab-hook-pilot/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   └── content-script.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── api/
│   │   └── gitlab-api.js
│   └── storage/
│       └── settings.js
├── icons/
├── tests/
├── README.md
├── LICENSE
└── .gitignore
GitLab API扩展预计会使用以下 GitLab REST API：GET /api/v4/user
GET /api/v4/groups/:id
GET /api/v4/groups/:id/projects
GET /api/v4/projects/:id/hooks
POST /api/v4/projects/:id/hooks
PUT /api/v4/projects/:id/hooks/:hook_id
DELETE /api/v4/projects/:id/hooks/:hook_id
当 Group 中包含超过 100 个项目时，扩展需要正确处理 GitLab API 分页。扫描 Subgroup 项目时，预计使用：GET /api/v4/groups/:id/projects?include_subgroups=true
Webhook 配置示例计划支持配置如下事件：{
  "url": "https://example.com/gitlab/webhook",
  "token": "webhook-secret",
  "merge_requests_events": true,
  "note_events": true,
  "push_events": false,
  "enable_ssl_verification": true
}
在创建 Webhook 之前，扩展会先查询当前项目已有的 Webhook，避免重复创建相同地址的配置。权限说明扩展使用当前登录用户身份调用 GitLab API。如果当前用户没有项目 Webhook 管理权限，接口可能返回：401 Unauthorized
403 Forbidden
404 Not Found
422 Unprocessable Entity
常见原因包括：GitLab 登录状态已经过期当前用户不是项目 Maintainer 或 Owner项目对当前用户不可见CSRF Token 缺失或失效GitLab 实例禁用了相关接口请求参数不符合当前 GitLab 版本要求扩展应当清晰展示每个项目的失败原因，而不是因为单个项目失败而中断全部任务。安全性GitLab HookPilot 应遵循以下安全原则：不主动读取或导出 GitLab Session Cookie不将 GitLab Cookie 保存到扩展存储中不将 Webhook Secret 上传到第三方服务不记录敏感请求头或认证信息不在日志中输出完整 Webhook Secret仅向用户明确授权的 GitLab 实例发送请求尽量减少浏览器扩展权限避免申请不必要的 cookies 权限配置变更前展示操作范围批量删除或覆盖配置前要求用户确认浏览器应通过当前 GitLab 页面会话自动携带认证 Cookie：fetch(url, {
  credentials: "include"
});
对于 POST、PUT 和 DELETE 请求，扩展可能需要从 GitLab 页面中获取 CSRF Token：const csrfToken = document
  .querySelector('meta[name="csrf-token"]')
  ?.getAttribute('content');
浏览器兼容性首个版本计划优先支持：Google ChromeMicrosoft EdgeChromium 内核浏览器扩展计划基于 Manifest V3 开发。Firefox 支持可能在后续版本中增加。开发目标GitLab HookPilot 的目标不是替代 GitLab Group Webhook 或 System Hook。它主要解决以下问题：GitLab 版本不支持 Group Webhook当前账号无法配置 Group Webhook项目分布在多个 Subgroup需要一次性为大量现有项目补充 Webhook需要检查不同项目之间的 Webhook 配置差异需要批量修复错误或缺失的 Webhook 配置对于持续运行和自动同步场景，建议后续配合服务端定时任务使用。浏览器扩展
负责首次配置、状态检查和人工修复

服务端任务
负责持续扫描新项目并自动补充配置
路线图第一阶段完成 Manifest V3 基础结构识别当前 GitLab 地址验证当前登录状态获取当前 Group 信息扫描 Group 下的所有项目展示项目列表第二阶段查询项目 Webhook检测目标 Webhook 是否存在批量创建 Webhook展示执行进度展示项目级执行结果第三阶段批量更新 Webhook批量删除 Webhook失败项目重试导出执行结果Webhook 连通性测试 贡献欢迎提交 Issue、功能建议和 Pull Request。在提交代码之前，请确保：代码不包含账号、Cookie 或 Token不在仓库中提交真实 Webhook Secret新功能具有明确的错误处理批量操作不会因单个项目失败而整体中断修改涉及敏感权限时同步更新安全说明许可证本项目计划使用 MIT License。免责声明GitLab HookPilot 是一个独立的开源项目，与 GitLab Inc. 不存在官方关联。GitLab 是 GitLab Inc. 的商标。使用本工具批量修改项目 Webhook 前，请确认当前账号具备相应权限，并确保目标 Webhook 服务地址可信。
