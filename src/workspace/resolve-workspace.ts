import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export type WorkspaceSource = "explicit" | "workspace-marker" | "legacy-marker" | "git";

export interface WorkspaceInfo {
  rootDir: string;
  displayName: string;
  workspaceId: string;
  source: WorkspaceSource;
}

export interface WorkspaceResolutionOptions {
  explicitRootDir?: string | null;
  cwd?: string;
}

interface MarkerIdentity {
  id?: string;
  name?: string;
}

function readMarkerIdentity(markerPath: string): MarkerIdentity | null {
  try {
    if (!fs.existsSync(markerPath)) return null;
    const raw = fs.readFileSync(markerPath, "utf-8");
    const parsed = JSON.parse(raw) as { id?: unknown; name?: unknown };
    return {
      id: typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : undefined,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined,
    };
  } catch {
    return {};
  }
}

function findUpward(startDir: string, predicate: (dir: string) => boolean): string | null {
  let current = path.resolve(startDir);

  while (true) {
    if (predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function findWorkspaceMarkerRoot(cwd: string): string | null {
  return findUpward(cwd, (dir) => fs.existsSync(path.join(dir, ".pi", "workspace.json")));
}

export function findLegacyProjectMarkerRoot(cwd: string): string | null {
  return findUpward(cwd, (dir) => fs.existsSync(path.join(dir, ".pi", "project.json")));
}

export function findGitRoot(cwd: string): string | null {
  return findUpward(cwd, (dir) => fs.existsSync(path.join(dir, ".git")));
}

function buildWorkspaceInfo(rootDir: string, source: WorkspaceSource, markerPath?: string): WorkspaceInfo {
  const resolvedRoot = path.resolve(rootDir);
  const marker = markerPath ? readMarkerIdentity(markerPath) : null;

  return {
    rootDir: resolvedRoot,
    displayName: marker?.name ?? path.basename(resolvedRoot),
    workspaceId: marker?.id ?? deriveWorkspaceId(resolvedRoot),
    source,
  };
}

function canonicalizeRoot(rootDir: string): string {
  const resolved = path.resolve(rootDir);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

/** Stable, opaque fallback identity for a canonical Workspace root. */
export function deriveWorkspaceId(rootDir: string): string {
  const canonicalRoot = canonicalizeRoot(rootDir);
  const normalized = process.platform === "win32" ? canonicalRoot.toLowerCase() : canonicalRoot;
  return `ws_${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

export function resolveWorkspace(options: WorkspaceResolutionOptions = {}): WorkspaceInfo | null {
  if (options.explicitRootDir && options.explicitRootDir.trim()) {
    return buildWorkspaceInfo(options.explicitRootDir, "explicit");
  }

  const cwd = options.cwd ?? process.cwd();
  const workspaceMarkerRoot = findWorkspaceMarkerRoot(cwd);
  if (workspaceMarkerRoot) {
    return buildWorkspaceInfo(
      workspaceMarkerRoot,
      "workspace-marker",
      path.join(workspaceMarkerRoot, ".pi", "workspace.json"),
    );
  }

  const legacyMarkerRoot = findLegacyProjectMarkerRoot(cwd);
  if (legacyMarkerRoot) {
    return buildWorkspaceInfo(
      legacyMarkerRoot,
      "legacy-marker",
      path.join(legacyMarkerRoot, ".pi", "project.json"),
    );
  }

  const gitRoot = findGitRoot(cwd);
  if (gitRoot) {
    return buildWorkspaceInfo(gitRoot, "git");
  }

  return null;
}

export function resolveWorkspaceRoot(options: WorkspaceResolutionOptions = {}): string | null {
  return resolveWorkspace(options)?.rootDir ?? null;
}

export function resolveWorkspaceIdentity(options: WorkspaceResolutionOptions = {}): string | null {
  return resolveWorkspace(options)?.workspaceId ?? null;
}
