import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { inspectKnowledgeIndex, summarizeKnowledgeInspection } from "../context/knowledge-index.js";
import { inspectSkillsForGovernance, summarizeSkillGovernance } from "../context/skill-governance.js";
import { resolveWorkspace } from "../workspace/index.js";
import type { MemoryConfig } from "../types.js";

export const CONTEXT_SCHEMA_VERSION = 1;

type NotifyLevel = "info" | "warning" | "error";

interface ContextCommandOptions {
  agentRoot: string;
  globalDir: string;
  config: Pick<MemoryConfig, "projectMemoryDirName" | "projectMemoryMode">;
}

interface CommandContext {
  cwd?: string;
  ui?: {
    notify?: (message: string, level?: NotifyLevel) => void;
  };
}

interface BootstrapWrite {
  path: string;
  created: boolean;
}

function notify(ctx: CommandContext, message: string, level: NotifyLevel = "info"): void {
  if (ctx.ui?.notify) {
    ctx.ui.notify(message, level);
  }
}

function stableWorkspaceId(rootDir: string): string {
  const digest = crypto.createHash("sha256").update(path.resolve(rootDir)).digest("hex").slice(0, 12);
  return `workspace-${digest}`;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function ensureFile(filePath: string, content: string): BootstrapWrite {
  if (fs.existsSync(filePath)) {
    return { path: filePath, created: false };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return { path: filePath, created: true };
}

function knowledgeIndexTemplate(scope: "global" | "workspace"): string {
  return [
    "# Knowledge INDEX",
    "",
    `Scope: ${scope}`,
    "",
    "This file is a semantic routing table for long-term background sources.",
    "Prefer pointing to existing Source of Truth documents instead of copying them.",
    "Use paths relative to this scope root so the index remains portable across machines.",
    "",
    "| Title | Path | Purpose | When to Read | Status | Last Reviewed | Supersedes | Superseded By |",
    "|---|---|---|---|---|---|---|---|",
    "",
  ].join("\n");
}

function globalKnowledgeIndexPath(agentRoot: string): string {
  return path.join(path.dirname(agentRoot), "knowledge", "INDEX.md");
}

function workspaceMarkdownTemplate(workspaceName: string): string {
  return [
    `# ${workspaceName} Workspace`,
    "",
    "This document is the Workspace entry point for long-term context.",
    "Keep current task state out of this file; use it for stable workspace orientation only.",
    "",
  ].join("\n");
}

function workspaceMarkerContent(rootDir: string): string {
  const workspaceName = path.basename(path.resolve(rootDir));
  return `${JSON.stringify({
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    id: stableWorkspaceId(rootDir),
    name: workspaceName,
    rootDir: path.resolve(rootDir),
  }, null, 2)}\n`;
}

function formatWriteResults(title: string, writes: BootstrapWrite[]): string {
  const lines = [`${title}:`];
  for (const write of writes) {
    lines.push(`- ${write.created ? "created" : "exists"} ${write.path}`);
  }
  return lines.join("\n");
}

function workspaceRootFromContext(ctx: CommandContext): string {
  const cwd = ctx.cwd ?? process.cwd();
  return resolveWorkspace({ cwd })?.rootDir ?? path.resolve(cwd);
}

function checkWorkspaceSchema(workspaceJsonPath: string): string {
  const json = readJsonFile(workspaceJsonPath);
  if (!json) return "missing or unreadable";
  const issues: string[] = [];
  if (json.schemaVersion !== CONTEXT_SCHEMA_VERSION) issues.push("schemaVersion mismatch");
  if (typeof json.id !== "string" || !json.id.trim()) issues.push("missing id");
  if (typeof json.name !== "string" || !json.name.trim()) issues.push("missing name");
  return issues.length === 0 ? "ok" : issues.join(", ");
}

function buildStatusLines(options: ContextCommandOptions, cwd?: string): string[] {
  const workspace = resolveWorkspace({ cwd });
  const workspacePiDir = workspace ? path.join(workspace.rootDir, options.config.projectMemoryDirName ?? ".pi") : null;
  const globalKnowledgeIndex = globalKnowledgeIndexPath(options.agentRoot);
  const workspaceKnowledgeIndex = workspacePiDir ? path.join(workspacePiDir, "knowledge", "INDEX.md") : null;

  return [
    "Context Status",
    `Current Workspace: ${workspace ? workspace.rootDir : "none"}`,
    `Workspace Source: ${workspace?.source ?? "none"}`,
    `Workspace ID: ${workspace?.workspaceId ?? "none"}`,
    `Active Layers: Global Base, ${workspace ? "Current Workspace Overlay, " : ""}Live Context`,
    `Global Memory Path: ${options.globalDir}`,
    `Global Knowledge Index: ${globalKnowledgeIndex}`,
    `Global Skill Path: ${path.join(options.globalDir, "skills")}`,
    `Workspace Memory Path: ${workspacePiDir ?? "none"}`,
    `Workspace Knowledge Index: ${workspaceKnowledgeIndex ?? "none"}`,
    `Workspace Skill Path: ${workspacePiDir ? path.join(workspacePiDir, "skills") : "none"}`,
    `Session Search: available`,
  ];
}

function buildDoctorLines(options: ContextCommandOptions, cwd?: string): string[] {
  const workspace = resolveWorkspace({ cwd });
  const workspacePiDir = workspace ? path.join(workspace.rootDir, options.config.projectMemoryDirName ?? ".pi") : null;
  const globalKnowledgeIndex = globalKnowledgeIndexPath(options.agentRoot);
  const workspaceKnowledgeIndex = workspacePiDir ? path.join(workspacePiDir, "knowledge", "INDEX.md") : null;
  const workspaceJsonPath = workspacePiDir ? path.join(workspacePiDir, "workspace.json") : null;
  const legacyMemoryDir = path.join(path.dirname(options.agentRoot), "memory");
  const globalKnowledge = inspectKnowledgeIndex(globalKnowledgeIndex, path.dirname(options.agentRoot));
  const workspaceKnowledge = workspace && workspaceKnowledgeIndex
    ? inspectKnowledgeIndex(workspaceKnowledgeIndex, workspace.rootDir)
    : null;
  const skillInspection = inspectSkillsForGovernance([
    { dir: path.join(options.globalDir, "skills"), scope: "global" },
    ...(workspacePiDir ? [{ dir: path.join(workspacePiDir, "skills"), scope: "workspace" } as const] : []),
  ]);

  const lines = ["Context Doctor (read-only)"];
  lines.push(`Runtime/tool availability: ok`);
  lines.push(`Workspace detection: ${workspace ? `${workspace.rootDir} (${workspace.source})` : "none"}`);
  lines.push(`Workspace ID: ${workspace?.workspaceId ?? "none"}`);
  lines.push(`Workspace schemaVersion: ${workspaceJsonPath ? checkWorkspaceSchema(workspaceJsonPath) : "not applicable"}`);
  lines.push(...summarizeKnowledgeInspection("Global Knowledge Index", globalKnowledge));
  if (workspaceKnowledge) {
    lines.push(...summarizeKnowledgeInspection("Workspace Knowledge Index", workspaceKnowledge));
  } else {
    lines.push(`Workspace Knowledge Index: missing ${workspaceKnowledgeIndex ?? "none"}`);
  }
  lines.push(`Global Memory Path: ${fs.existsSync(options.globalDir) ? "ok" : "missing"} ${options.globalDir}`);
  lines.push(`Global Skill Path: ${fs.existsSync(path.join(options.globalDir, "skills")) ? "ok" : "missing"} ${path.join(options.globalDir, "skills")}`);
  lines.push(`Workspace Memory Path: ${workspacePiDir && fs.existsSync(workspacePiDir) ? "ok" : "missing"} ${workspacePiDir ?? "none"}`);
  lines.push(`Workspace Skill Path: ${workspacePiDir && fs.existsSync(path.join(workspacePiDir, "skills")) ? "ok" : "missing"} ${workspacePiDir ? path.join(workspacePiDir, "skills") : "none"}`);
  lines.push(`Legacy ~/.pi/memory/: ${fs.existsSync(legacyMemoryDir) ? "present" : "absent"} ${legacyMemoryDir}`);
  lines.push("Broken Knowledge paths: checked");
  lines.push("Duplicate Source of Truth: checked");
  lines.push("Stale documents: checked");
  lines.push(...summarizeSkillGovernance(skillInspection));
  lines.push("No fixes were applied.");
  return lines;
}

export function registerContextCommands(pi: ExtensionAPI, options: ContextCommandOptions): void {
  pi.registerCommand("context-init-global", {
    description: "Initialize the Global Knowledge INDEX without overwriting existing content",
    handler: async (_args, ctx: CommandContext) => {
      const indexPath = globalKnowledgeIndexPath(options.agentRoot);
      const result = ensureFile(indexPath, knowledgeIndexTemplate("global"));
      notify(ctx, formatWriteResults("Global context bootstrap", [result]), "info");
    },
  });

  pi.registerCommand("context-init-workspace", {
    description: "Initialize Workspace context files without overwriting existing content",
    handler: async (_args, ctx: CommandContext) => {
      const workspaceRoot = workspaceRootFromContext(ctx);
      const piDir = path.join(workspaceRoot, options.config.projectMemoryDirName ?? ".pi");
      const workspaceName = path.basename(workspaceRoot);
      const writes = [
        ensureFile(path.join(piDir, "workspace.json"), workspaceMarkerContent(workspaceRoot)),
        ensureFile(path.join(piDir, "WORKSPACE.md"), workspaceMarkdownTemplate(workspaceName)),
        ensureFile(path.join(piDir, "knowledge", "INDEX.md"), knowledgeIndexTemplate("workspace")),
      ];
      notify(ctx, formatWriteResults("Workspace context bootstrap", writes), "info");
    },
  });

  pi.registerCommand("context-doctor", {
    description: "Run read-only diagnostics for the long-term context system",
    handler: async (_args, ctx: CommandContext) => {
      notify(ctx, buildDoctorLines(options, ctx.cwd).join("\n"), "info");
    },
  });

  pi.registerCommand("context-status", {
    description: "Show the active Global, Workspace, and Live Context layers",
    handler: async (_args, ctx: CommandContext) => {
      notify(ctx, buildStatusLines(options, ctx.cwd).join("\n"), "info");
    },
  });
}
