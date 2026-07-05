import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { registerContextCommands } from "../../src/handlers/context-commands.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-commands-"));
}

function makePi() {
  const commands = new Map<string, any>();
  return {
    commands,
    pi: {
      registerCommand: (name: string, command: any) => {
        commands.set(name, command);
      },
    },
  };
}

function makeCtx(cwd: string) {
  const notifications: Array<{ message: string; level?: string }> = [];
  return {
    ctx: {
      cwd,
      ui: {
        notify: (message: string, level?: string) => {
          notifications.push({ message, level });
        },
      },
    },
    notifications,
  };
}

describe("registerContextCommands", () => {
  it("registers the bootstrap and diagnostic commands", () => {
    const root = makeTempDir();
    const { pi, commands } = makePi();

    registerContextCommands(pi as any, {
      agentRoot: path.join(root, "agent"),
      globalDir: path.join(root, "agent", "pi-hermes-memory"),
      config: { projectMemoryDirName: ".pi", projectMemoryMode: "repo-local" },
    });

    assert.deepStrictEqual(
      Array.from(commands.keys()).sort(),
      ["context-doctor", "context-init-global", "context-init-workspace", "context-status"],
    );
  });

  it("initializes the global Knowledge INDEX without overwriting it", async () => {
    const root = makeTempDir();
    const agentRoot = path.join(root, "agent");
    const { pi, commands } = makePi();
    registerContextCommands(pi as any, {
      agentRoot,
      globalDir: path.join(agentRoot, "pi-hermes-memory"),
      config: { projectMemoryDirName: ".pi", projectMemoryMode: "repo-local" },
    });

    const { ctx, notifications } = makeCtx(root);
    await commands.get("context-init-global").handler({}, ctx);

    const indexPath = path.join(root, "knowledge", "INDEX.md");
    assert.ok(fs.existsSync(indexPath));
    assert.match(fs.readFileSync(indexPath, "utf-8"), /Scope: global/);

    fs.writeFileSync(indexPath, "custom source of truth\n", "utf-8");
    await commands.get("context-init-global").handler({}, ctx);

    assert.strictEqual(fs.readFileSync(indexPath, "utf-8"), "custom source of truth\n");
    assert.match(notifications.at(-1)?.message ?? "", /exists/);
  });

  it("initializes Workspace marker, entry point, and Knowledge INDEX without overwriting", async () => {
    const root = makeTempDir();
    const workspaceRoot = path.join(root, "repo");
    fs.mkdirSync(path.join(workspaceRoot, ".git"), { recursive: true });
    const { pi, commands } = makePi();
    registerContextCommands(pi as any, {
      agentRoot: path.join(root, "agent"),
      globalDir: path.join(root, "agent", "pi-hermes-memory"),
      config: { projectMemoryDirName: ".pi", projectMemoryMode: "repo-local" },
    });

    const { ctx, notifications } = makeCtx(path.join(workspaceRoot, "src"));
    fs.mkdirSync(ctx.cwd, { recursive: true });
    await commands.get("context-init-workspace").handler({}, ctx);

    const markerPath = path.join(workspaceRoot, ".pi", "workspace.json");
    const workspacePath = path.join(workspaceRoot, ".pi", "WORKSPACE.md");
    const indexPath = path.join(workspaceRoot, ".pi", "knowledge", "INDEX.md");

    assert.ok(fs.existsSync(markerPath));
    assert.ok(fs.existsSync(workspacePath));
    assert.ok(fs.existsSync(indexPath));
    assert.strictEqual(JSON.parse(fs.readFileSync(markerPath, "utf-8")).schemaVersion, 1);
    assert.match(fs.readFileSync(indexPath, "utf-8"), /Scope: workspace/);

    fs.writeFileSync(workspacePath, "do not overwrite\n", "utf-8");
    await commands.get("context-init-workspace").handler({}, ctx);

    assert.strictEqual(fs.readFileSync(workspacePath, "utf-8"), "do not overwrite\n");
    assert.match(notifications.at(-1)?.message ?? "", /exists/);
  });

  it("reports status and doctor diagnostics without creating files", async () => {
    const root = makeTempDir();
    const agentRoot = path.join(root, "agent");
    const globalDir = path.join(agentRoot, "pi-hermes-memory");
    const workspaceRoot = path.join(root, "repo");
    fs.mkdirSync(path.join(workspaceRoot, ".git"), { recursive: true });
    const { pi, commands } = makePi();
    registerContextCommands(pi as any, {
      agentRoot,
      globalDir,
      config: { projectMemoryDirName: ".pi", projectMemoryMode: "repo-local" },
    });

    const { ctx, notifications } = makeCtx(workspaceRoot);
    await commands.get("context-status").handler({}, ctx);
    await commands.get("context-doctor").handler({}, ctx);

    assert.match(notifications[0].message, /Current Workspace:/);
    assert.match(notifications[0].message, /Active Layers: Global Base, Current Workspace Overlay, Live Context/);
    assert.match(notifications[1].message, /Context Doctor \(read-only\)/);
    assert.match(notifications[1].message, /Global Knowledge Index: missing/);
    assert.match(notifications[1].message, /No fixes were applied/);
    assert.strictEqual(fs.existsSync(path.join(root, "knowledge")), false);
  });

  it("reports broken Knowledge paths and duplicate Source of Truth entries", async () => {
    const root = makeTempDir();
    const agentRoot = path.join(root, "agent");
    const workspaceRoot = path.join(root, "repo");
    fs.mkdirSync(path.join(workspaceRoot, ".git"), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, ".pi", "knowledge"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, ".pi", "knowledge", "INDEX.md"), [
      "| Title | Path | Purpose | When to Read | Status | Last Reviewed | Supersedes | Superseded By |",
      "|---|---|---|---|---|---|---|---|",
      "| Architecture | docs/A.md | A | A | active | 2026-07-05 | | |",
      "| Architecture | docs/missing.md | B | B | active | 2026-07-05 | | |",
    ].join("\n"), "utf-8");

    const { pi, commands } = makePi();
    registerContextCommands(pi as any, {
      agentRoot,
      globalDir: path.join(agentRoot, "pi-hermes-memory"),
      config: { projectMemoryDirName: ".pi", projectMemoryMode: "repo-local" },
    });

    const { ctx, notifications } = makeCtx(workspaceRoot);
    await commands.get("context-doctor").handler({}, ctx);

    assert.match(notifications[0].message, /Workspace Knowledge Index broken paths: docs\/A\.md, docs\/missing\.md/);
    assert.match(notifications[0].message, /Workspace Knowledge Index duplicate Source of Truth: title:architecture/);
  });
});
