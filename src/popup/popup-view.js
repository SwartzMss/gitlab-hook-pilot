import { getProjectLabel } from "./project-selection.js";

export function createSuccessView(data) {
  const username = data.user.name ?? data.user.username;

  return {
    status: `已使用 ${username} 的权限完成扫描。`,
    groupName: data.group.full_name ?? data.group.name,
    projectCount: `共发现 ${data.projects.length} 个可管理项目`,
    projects: data.projects.map((project) => ({
      id: project.id,
      label: getProjectLabel(project),
      url: project.web_url
    })),
    buttonLabel: "重新检查"
  };
}

export function createErrorView(error) {
  return {
    status: error?.message ?? "扩展没有返回有效结果。",
    buttonLabel: "重试"
  };
}

export function createPreviewView(preview) {
  const { summary } = preview;

  return {
    status: `预览完成：${summary.createProjects} 个项目待创建，${summary.updateProjects} 个项目待更新，${summary.failedProjects} 个项目查询失败。`,
    summaryText: `共 ${summary.totalProjects} 个项目，待更新 ${summary.updateHooks} 个 Webhook`,
    items: preview.items.map((item) => ({
      id: item.project.id,
      label: getProjectLabel(item.project),
      action: previewActionLabel(item),
      okToWrite: item.action === "create" || item.action === "update",
      error: item.error?.message ?? ""
    }))
  };
}

export function createExecutionView(result) {
  const { summary } = result;

  return {
    status: `执行完成：${summary.successProjects} 个成功，${summary.partialProjects} 个部分成功，${summary.failedProjects} 个失败。`,
    summaryText: `共处理 ${summary.totalProjects} 个项目`,
    items: result.items.map((item) => ({
      id: item.project.id,
      label: getProjectLabel(item.project),
      action: executionStatusLabel(item),
      error: item.error?.message ?? item.hookResults?.find((hook) => !hook.ok)?.error?.message ?? ""
    }))
  };
}

function previewActionLabel(item) {
  if (item.action === "create") return "待创建";
  if (item.action === "update") return `待更新 ${item.hookIds.length} 个`;
  return "查询失败";
}

function executionStatusLabel(item) {
  if (item.status === "create_success") return "创建成功";
  if (item.status === "update_success") return "更新成功";
  if (item.status === "partial_update_success") return "部分更新成功";
  return "写入失败";
}
