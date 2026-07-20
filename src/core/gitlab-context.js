export function parseGitLabGroupUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  return { origin: url.origin, scope: "instance" };
}
