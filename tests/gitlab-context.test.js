import test from "node:test";
import assert from "node:assert/strict";
import { parseGitLabGroupUrl } from "../src/core/gitlab-context.js";

for (const path of [
  "/dashboard/projects",
  "/explore",
  "/groups/oss/xx/-/projects",
  "/oss/xx/project-a",
  "/oss/xx/project-a/-/settings/integrations"
]) {
  test(`recognizes instance context for ${path}`, () => {
    assert.deepEqual(parseGitLabGroupUrl(`https://gitlab.example.com${path}`), {
      origin: "https://gitlab.example.com",
      scope: "instance"
    });
  });
}

test("preserves a GitLab origin with a custom port", () => {
  assert.deepEqual(parseGitLabGroupUrl("http://localhost:8929/root/test"), {
    origin: "http://localhost:8929",
    scope: "instance"
  });
});

for (const url of ["chrome://extensions", "not a url"]) {
  test(`rejects non-HTTP URL: ${url}`, () => {
    assert.equal(parseGitLabGroupUrl(url), null);
  });
}
