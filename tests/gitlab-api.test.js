import test from "node:test";
import assert from "node:assert/strict";
import {
  GitLabApiError,
  createProjectHook,
  fetchAllGroupProjects,
  fetchAllUserProjects,
  fetchProjectHooks,
  mapHttpError,
  updateProjectHook
} from "../src/core/gitlab-api.js";

test("maps known GitLab HTTP statuses", () => {
  assert.equal(mapHttpError(401).code, "SIGNED_OUT");
  assert.equal(mapHttpError(403).code, "FORBIDDEN");
  assert.equal(mapHttpError(404).code, "NOT_FOUND");
  assert.equal(mapHttpError(500).code, "API_ERROR");
});

test("loads and merges every project page", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const page = new URL(url).searchParams.get("page");

    return {
      ok: true,
      headers: new Headers({ "x-next-page": page === "1" ? "2" : "" }),
      json: async () => page === "1"
        ? [{ id: 1, name: "One" }]
        : [{ id: 2, name: "Two" }]
    };
  };

  const projects = await fetchAllGroupProjects(
    "https://gitlab.example.com",
    "platform/tools",
    fetchImpl
  );

  assert.deepEqual(projects.map(({ id }) => id), [1, 2]);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /include_subgroups=true/);
  assert.match(calls[0], /per_page=100/);
});

test("throws a normalized error without accepting partial results", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403 });

  await assert.rejects(
    fetchAllGroupProjects("https://gitlab.example.com", "platform", fetchImpl),
    (error) => error instanceof GitLabApiError && error.code === "FORBIDDEN"
  );
});

test("creates and updates project hooks with form-encoded fields and optional CSRF token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });

    return {
      ok: true,
      json: async () => ({ id: 1 })
    };
  };

  await createProjectHook(
    "https://gitlab.example.com",
    123,
    {
      url: "https://hooks.example.com/gitlab",
      token: "secret",
      note_events: true,
      merge_requests_events: true,
      push_events: false
    },
    fetchImpl,
    "csrf-token"
  );
  await updateProjectHook(
    "https://gitlab.example.com",
    123,
    456,
    { url: "https://hooks.example.com/gitlab", token: "secret" },
    fetchImpl
  );

  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers["X-CSRF-Token"], "csrf-token");
  assert.match(calls[0].options.headers["Content-Type"], /application\/x-www-form-urlencoded/);
  assert.match(calls[0].options.body, /url=https%3A%2F%2Fhooks\.example\.com%2Fgitlab/);
  assert.match(calls[0].options.body, /token=secret/);
  assert.match(calls[0].options.body, /note_events=true/);
  assert.match(calls[0].options.body, /merge_requests_events=true/);
  assert.match(calls[0].options.body, /push_events=false/);
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(calls[1].options.headers["X-CSRF-Token"], undefined);
});

test("does not encode omitted token fields", async () => {
  let body = "";
  const fetchImpl = async (_url, options) => {
    body = options.body;
    return {
      ok: true,
      json: async () => ({ id: 1 })
    };
  };

  await createProjectHook(
    "https://gitlab.example.com",
    123,
    { url: "https://hooks.example.com/gitlab", note_events: true },
    fetchImpl
  );

  assert.doesNotMatch(body, /token=/);
});

test("loads and merges every project hook page", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const page = new URL(url).searchParams.get("page");

    return {
      ok: true,
      headers: new Headers({ "x-next-page": page === "1" ? "2" : "" }),
      json: async () => page === "1"
        ? [{ id: 1, url: "https://one.example.com" }]
        : [{ id: 2, url: "https://two.example.com" }]
    };
  };

  const hooks = await fetchProjectHooks("https://gitlab.example.com", 123, fetchImpl);

  assert.deepEqual(hooks.map(({ id }) => id), [1, 2]);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /per_page=100/);
});

test("loads user membership projects for instance scans", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const page = new URL(url).searchParams.get("page");

    return {
      ok: true,
      headers: new Headers({ "x-next-page": page === "1" ? "2" : "" }),
      json: async () => page === "1"
        ? [{ id: 1, name: "One" }]
        : [{ id: 2, name: "Two" }]
    };
  };

  const projects = await fetchAllUserProjects("http://localhost:8929", fetchImpl);

  assert.deepEqual(projects.map(({ id }) => id), [1, 2]);
  assert.match(calls[0], /membership=true/);
});
