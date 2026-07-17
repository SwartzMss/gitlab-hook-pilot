export function parseGitLabGroupUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const groupPath = parseGroupPath(url.pathname);
  if (groupPath) return { origin: url.origin, groupPath };

  const projectContext = parseProjectContext(url.pathname);
  return projectContext ? { origin: url.origin, ...projectContext } : { origin: url.origin, scope: "instance" };
}

function parseGroupPath(pathname) {
  const match = pathname.match(/^\/groups\/(.+?)(?:\/-\/.*)?\/?$/);
  if (!match) return null;

  return normalizePath(match[1]);
}

function parseProjectContext(pathname) {
  const usefulPath = pathname.split("/-/")[0];
  const parts = normalizePath(usefulPath)?.split("/") ?? [];

  if (parts.length < 2) return null;
  if (isReservedRoot(parts[0])) return null;

  return {
    groupPath: parts.slice(0, -1).join("/"),
    projectPath: parts.join("/")
  };
}

function normalizePath(path) {
  return path
    .split("/")
    .map((part) => decodeURIComponent(part))
    .filter(Boolean)
    .join("/");
}

function isReservedRoot(part) {
  return new Set([
    "admin",
    "api",
    "dashboard",
    "explore",
    "help",
    "profile",
    "projects",
    "search",
    "users"
  ]).has(part);
}
