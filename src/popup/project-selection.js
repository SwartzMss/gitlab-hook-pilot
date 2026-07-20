export function getProjectLabel(project) {
  return project.path_with_namespace ?? project.name ?? `project-${project.id}`;
}

export function createSelectedProjectIds(projects = []) {
  return new Set(projects.map((project) => String(project.id)));
}

export function getSelectedProjects(projects = [], selectedProjectIds = new Set()) {
  return projects.filter((project) => selectedProjectIds.has(String(project.id)));
}

export function filterProjects(projects = [], query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return projects;
  return projects.filter((project) => getProjectLabel(project).toLocaleLowerCase().includes(normalizedQuery));
}

export function getSelectionState(selectedProjectIds, totalCount) {
  const selectedCount = selectedProjectIds.size;
  return {
    checked: totalCount > 0 && selectedCount === totalCount,
    indeterminate: selectedCount > 0 && selectedCount < totalCount,
    selectedCount,
    totalCount
  };
}

export function createProjectIdSnapshot(projects = []) {
  return projects.map((project) => String(project.id)).sort();
}

export function projectIdSnapshotsEqual(left = [], right = []) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
