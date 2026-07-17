import test from "node:test";
import assert from "node:assert/strict";
import { parseGitLabGroupUrl } from "../src/core/gitlab-context.js";

test("recognizes a top-level group", () => {
  assert.deepEqual(parseGitLabGroupUrl("https://gitlab.example.com/groups/platform/-/activity"), {
    origin: "https://gitlab.example.com",
    groupPath: "platform"
  });
});

test("recognizes a nested group", () => {
  assert.deepEqual(parseGitLabGroupUrl("https://gitlab.example.com/groups/platform/tools/-/projects"), {
    origin: "https://gitlab.example.com",
    groupPath: "platform/tools"
  });
});

test("recognizes a project page and uses its namespace as the group path", () => {
  assert.deepEqual(parseGitLabGroupUrl("http://localhost:8929/root/test"), {
    origin: "http://localhost:8929",
    groupPath: "root",
    projectPath: "root/test"
  });
});

test("recognizes a nested project page and uses its namespace as the group path", () => {
  assert.deepEqual(parseGitLabGroupUrl("https://gitlab.example.com/platform/tools/runner/-/settings/integrations"), {
    origin: "https://gitlab.example.com",
    groupPath: "platform/tools",
    projectPath: "platform/tools/runner"
  });
});

test("recognizes an instance page when no group or project can be inferred", () => {
  assert.deepEqual(parseGitLabGroupUrl("http://localhost:8929/dashboard/projects"), {
    origin: "http://localhost:8929",
    scope: "instance"
  });
});

for (const url of ["chrome://extensions"]) {
  test(`rejects non-group URL: ${url}`, () => {
    assert.equal(parseGitLabGroupUrl(url), null);
  });
}
