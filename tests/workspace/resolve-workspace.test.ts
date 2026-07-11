import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  deriveWorkspaceId,
  resolveWorkspace,
  resolveWorkspaceIdentity,
  resolveWorkspaceRoot,
} from "../../src/workspace/index.js";

describe("resolveWorkspace", () => {
  it("uses an explicit workspace root first", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-explicit-"));
    try {
      const result = resolveWorkspace({ explicitRootDir: tmp, cwd: os.homedir() });
      assert.deepStrictEqual(result, {
        rootDir: path.resolve(tmp),
        displayName: path.basename(tmp),
        workspaceId: deriveWorkspaceId(tmp),
        source: "explicit",
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("finds .pi/workspace.json from a nested directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-marker-"));
    try {
      const root = path.join(tmp, "repo");
      const nested = path.join(root, "src", "feature");
      fs.mkdirSync(path.join(root, ".pi"), { recursive: true });
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(
        path.join(root, ".pi", "workspace.json"),
        JSON.stringify({ schemaVersion: 1, id: "stable-id", name: "Stable Workspace" }),
      );

      const result = resolveWorkspace({ cwd: nested });
      assert.strictEqual(result?.rootDir, root);
      assert.strictEqual(result?.displayName, "Stable Workspace");
      assert.strictEqual(result?.workspaceId, "stable-id");
      assert.strictEqual(result?.source, "workspace-marker");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("supports legacy .pi/project.json as a marker", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-legacy-marker-"));
    try {
      const root = path.join(tmp, "legacy");
      fs.mkdirSync(path.join(root, ".pi"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".pi", "project.json"),
        JSON.stringify({ id: "legacy-id", name: "Legacy Name" }),
      );

      const result = resolveWorkspace({ cwd: root });
      assert.strictEqual(result?.rootDir, root);
      assert.strictEqual(result?.displayName, "Legacy Name");
      assert.strictEqual(result?.workspaceId, "legacy-id");
      assert.strictEqual(result?.source, "legacy-marker");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("falls back to a Git root", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-git-"));
    try {
      const root = path.join(tmp, "repo");
      const nested = path.join(root, "packages", "app");
      fs.mkdirSync(path.join(root, ".git"), { recursive: true });
      fs.mkdirSync(nested, { recursive: true });

      const result = resolveWorkspace({ cwd: nested });
      assert.strictEqual(result?.rootDir, root);
      assert.strictEqual(result?.displayName, "repo");
      assert.strictEqual(result?.workspaceId, deriveWorkspaceId(root));
      assert.strictEqual(result?.source, "git");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("isolates same-named Git workspaces by canonical root", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-same-name-"));
    try {
      const first = path.join(tmp, "one", "repo");
      const second = path.join(tmp, "two", "repo");
      fs.mkdirSync(path.join(first, ".git"), { recursive: true });
      fs.mkdirSync(path.join(second, ".git"), { recursive: true });

      const firstWorkspace = resolveWorkspace({ cwd: first });
      const secondWorkspace = resolveWorkspace({ cwd: second });

      assert.strictEqual(firstWorkspace?.displayName, "repo");
      assert.strictEqual(secondWorkspace?.displayName, "repo");
      assert.notStrictEqual(firstWorkspace?.workspaceId, secondWorkspace?.workspaceId);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns null outside a workspace", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-none-"));
    try {
      assert.strictEqual(resolveWorkspace({ cwd: tmp }), null);
      assert.strictEqual(resolveWorkspaceRoot({ cwd: tmp }), null);
      assert.strictEqual(resolveWorkspaceIdentity({ cwd: tmp }), null);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
