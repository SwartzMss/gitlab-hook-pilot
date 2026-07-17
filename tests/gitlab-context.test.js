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

for (const url of [
  "https://gitlab.example.com/platform/project",
  "https://gitlab.example.com/users/sign_in",
  "chrome://extensions"
]) {
  test(`rejects non-group URL: ${url}`, () => {
    assert.equal(parseGitLabGroupUrl(url), null);
  });
}
