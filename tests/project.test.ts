import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { detectProject, detectProjectSkills, findGitRoot } from "../src/project.js";
import { AGENT_ROOT } from "../src/paths.js";

describe("project detection", () => {
  it("detectProject returns null outside a project", () => {
    const result = detectProject("projects-memory", os.homedir());
    assert.deepStrictEqual(result, { name: null, rootDir: null, memoryDir: null });
  });

  it("detectProject resolves the project memory directory from cwd", () => {
    const cwd = "/tmp/demo-repo";
    const result = detectProject("projects-memory", cwd);

    assert.strictEqual(result.name, "demo-repo");
    assert.strictEqual(result.rootDir, null);
    assert.strictEqual(
      result.memoryDir,
      path.join(AGENT_ROOT, "projects-memory", "demo-repo"),
    );
  });

  it("detectProjectSkills appends the skills directory for dynamic discovery", () => {
    const cwd = "/tmp/demo-repo";
    const result = detectProjectSkills("projects-memory", cwd);

    assert.strictEqual(result.name, "demo-repo");
    assert.strictEqual(
      result.skillsDir,
      path.join(AGENT_ROOT, "projects-memory", "demo-repo", "skills"),
    );
  });

  it("findGitRoot walks upward and accepts .git files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-git-root-"));
    try {
      const repo = path.join(tmp, "repo");
      const nested = path.join(repo, "src", "module");
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(repo, ".git"), "gitdir: ../actual.git\n");

      assert.strictEqual(findGitRoot(nested), repo);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("detectProject supports repo-local project memory from nested cwd", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-repo-local-"));
    try {
      const repo = path.join(tmp, "demo-repo");
      const nested = path.join(repo, "src", "module");
      fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
      fs.mkdirSync(nested, { recursive: true });

      const result = detectProject({
        projectMemoryMode: "repo-local",
        projectMemoryDirName: ".pi",
      }, nested);

      assert.strictEqual(result.name, "demo-repo");
      assert.strictEqual(result.rootDir, repo);
      assert.strictEqual(result.memoryDir, path.join(repo, ".pi"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("detectProject returns null in repo-local mode outside a git repo", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-no-git-"));
    try {
      const result = detectProject({ projectMemoryMode: "repo-local" }, tmp);
      assert.deepStrictEqual(result, { name: null, rootDir: null, memoryDir: null });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
