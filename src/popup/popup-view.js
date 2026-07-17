export function createSuccessView(data) {
  const username = data.user.name ?? data.user.username;

  return {
    status: `已使用 ${username} 的权限完成扫描。`,
    groupName: data.group.full_name ?? data.group.name,
    projectCount: `共发现 ${data.projects.length} 个项目`,
    projects: data.projects.map((project) => ({
      id: project.id,
      label: project.path_with_namespace ?? project.name,
      url: project.web_url
    })),
    buttonLabel: "重新扫描"
  };
}

export function createErrorView(error) {
  return {
    status: error?.message ?? "扩展没有返回有效结果。",
    buttonLabel: "重试"
  };
}
