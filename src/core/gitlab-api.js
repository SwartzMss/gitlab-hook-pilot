const ERROR_DETAILS = {
  401: ["SIGNED_OUT", "GitLab 登录状态已失效，请重新登录。"],
  403: ["FORBIDDEN", "当前账户没有读取该 Group 的权限。"],
  404: ["NOT_FOUND", "找不到该 Group，或当前账户无法访问。"]
};

export class GitLabApiError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = "GitLabApiError";
    this.code = code;
    this.status = status;
  }
}

export function mapHttpError(status) {
  const [code, message] = ERROR_DETAILS[status]
    ?? ["API_ERROR", `GitLab API 请求失败（HTTP ${status}）。`];

  return new GitLabApiError(code, message, status);
}

async function requestJson(url, fetchImpl, options = {}) {
  let response;

  try {
    response = await fetchImpl(url, {
      credentials: "include",
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body
    });
  } catch {
    throw new GitLabApiError("NETWORK_ERROR", "无法连接 GitLab，请检查网络后重试。");
  }

  if (!response.ok) throw mapHttpError(response.status);

  return { data: await response.json(), response };
}

async function getJson(url, fetchImpl) {
  return requestJson(url, fetchImpl);
}

async function sendForm(url, payload, fetchImpl, csrfToken, method) {
  const headers = { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  return (await requestJson(url, fetchImpl, {
    method,
    headers,
    body: encodeFormPayload(payload)
  })).data;
}

export async function fetchCurrentUser(origin, fetchImpl = fetch) {
  return (await getJson(`${origin}/api/v4/user`, fetchImpl)).data;
}

export async function fetchGroup(origin, groupPath, fetchImpl = fetch) {
  const id = encodeURIComponent(groupPath);
  return (await getJson(`${origin}/api/v4/groups/${id}`, fetchImpl)).data;
}

export async function fetchProject(origin, projectPath, fetchImpl = fetch) {
  const id = encodeURIComponent(projectPath);
  return (await getJson(`${origin}/api/v4/projects/${id}`, fetchImpl)).data;
}

export async function fetchAllGroupProjects(origin, groupPath, fetchImpl = fetch) {
  const projects = [];
  let page = "1";

  do {
    const id = encodeURIComponent(groupPath);
    const url = new URL(`${origin}/api/v4/groups/${id}/projects`);
    url.searchParams.set("include_subgroups", "true");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", page);

    const result = await getJson(url.toString(), fetchImpl);
    projects.push(...result.data);
    page = result.response.headers.get("x-next-page") || "";
  } while (page);

  return projects;
}

export async function fetchAllUserProjects(origin, options = {}) {
  const projects = [];
  const fetchImpl = options.fetchImpl ?? fetch;
  let page = "1";

  do {
    const url = new URL(`${origin}/api/v4/projects`);
    if (options.minAccessLevel != null) {
      url.searchParams.set("min_access_level", String(options.minAccessLevel));
    } else {
      url.searchParams.set("membership", "true");
    }
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", page);

    const result = await getJson(url.toString(), fetchImpl);
    projects.push(...result.data);
    page = result.response.headers.get("x-next-page") || "";
  } while (page);

  return projects;
}

export async function fetchProjectHooks(origin, projectId, fetchImpl = fetch) {
  const hooks = [];
  const id = encodeURIComponent(projectId);
  let page = "1";

  do {
    const url = new URL(`${origin}/api/v4/projects/${id}/hooks`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", page);

    const result = await getJson(url.toString(), fetchImpl);
    hooks.push(...result.data);
    page = result.response.headers.get("x-next-page") || "";
  } while (page);

  return hooks;
}

export async function createProjectHook(origin, projectId, payload, fetchImpl = fetch, csrfToken = "") {
  const id = encodeURIComponent(projectId);
  return sendForm(`${origin}/api/v4/projects/${id}/hooks`, payload, fetchImpl, csrfToken, "POST");
}

export async function updateProjectHook(origin, projectId, hookId, payload, fetchImpl = fetch, csrfToken = "") {
  const project = encodeURIComponent(projectId);
  const hook = encodeURIComponent(hookId);
  return sendForm(`${origin}/api/v4/projects/${project}/hooks/${hook}`, payload, fetchImpl, csrfToken, "PUT");
}

function encodeFormPayload(payload) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(payload)) {
    body.set(key, String(value));
  }

  return body.toString();
}
