import test from "node:test";
import assert from "node:assert/strict";
import { GitLabApiError, fetchAllGroupProjects, mapHttpError } from "../src/core/gitlab-api.js";

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
