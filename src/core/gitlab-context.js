export function parseGitLabGroupUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const match = url.pathname.match(/^\/groups\/(.+?)(?:\/-\/.*)?\/?$/);
  if (!match) return null;

  const groupPath = match[1]
    .split("/")
    .map((part) => decodeURIComponent(part))
    .filter(Boolean)
    .join("/");

  return groupPath ? { origin: url.origin, groupPath } : null;
}
