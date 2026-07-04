/**
 * Project detection — determines whether the current working directory
 * represents a project and resolves its name.
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { resolveProjectsRoot } from "./paths.js";
import type { ProjectMemoryMode } from "./types.js";

export interface ProjectInfo {
  /** Project name (directory basename), or null if not in a project. */
  name: string | null;
  /** Git root for repo-local project memory, or null when unavailable/not used. */
  rootDir: string | null;
  /** Path to the project-scoped memory directory, or null. */
  memoryDir: string | null;
}

export interface ProjectSkillInfo extends ProjectInfo {
  /** Path to the project-scoped skills directory, or null. */
  skillsDir: string | null;
}

export interface ProjectDetectionOptions {
  /** Project memory storage mode. Default: central */
  projectMemoryMode?: ProjectMemoryMode;
  /** Central project memory directory, relative to ~/.pi/agent. */
  projectsMemoryDir?: string;
  /** Repo-local memory directory name. Default: .pi */
  projectMemoryDirName?: string;
}

function normalizeDetectionOptions(optionsOrProjectsMemoryDir?: ProjectDetectionOptions | string): Required<ProjectDetectionOptions> {
  if (typeof optionsOrProjectsMemoryDir === "string") {
    return {
      projectMemoryMode: "central",
      projectsMemoryDir: optionsOrProjectsMemoryDir,
      projectMemoryDirName: ".pi",
    };
  }
  return {
    projectMemoryMode: optionsOrProjectsMemoryDir?.projectMemoryMode ?? "central",
    projectsMemoryDir: optionsOrProjectsMemoryDir?.projectsMemoryDir ?? "projects-memory",
    projectMemoryDirName: optionsOrProjectsMemoryDir?.projectMemoryDirName ?? ".pi",
  };
}

export function findGitRoot(cwd: string): string | null {
  let current = path.resolve(cwd);

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Detect project from the current working directory.
 *
 * A "project" is any directory that is not the user's home directory.
 * The project name is the directory's basename.
 * Project-scoped memory is stored at ~/.pi/agent/<projectsMemoryDir>/<projectName>/.
 * In repo-local mode, the project must be inside a Git worktree and memory
 * is stored at <git-root>/<projectMemoryDirName>/.
 */
export function detectProject(
  optionsOrProjectsMemoryDir: ProjectDetectionOptions | string = "projects-memory",
  cwd?: string,
): ProjectInfo {
  const options = normalizeDetectionOptions(optionsOrProjectsMemoryDir);
  const dir = cwd ?? process.cwd();
  const homeDir = os.homedir();

  // Normalize paths for comparison
  const resolved = path.resolve(dir);
  const resolvedHome = path.resolve(homeDir);

  if (resolved === resolvedHome || resolved === "/" || !resolved || resolved === resolvedHome + "/") {
    return { name: null, rootDir: null, memoryDir: null };
  }

  if (options.projectMemoryMode === "repo-local") {
    const rootDir = findGitRoot(resolved);
    if (!rootDir) return { name: null, rootDir: null, memoryDir: null };

    return {
      name: path.basename(rootDir),
      rootDir,
      memoryDir: path.join(rootDir, options.projectMemoryDirName),
    };
  }

  const name = path.basename(resolved);
  if (!name || name === "." || name === "..") {
    return { name: null, rootDir: null, memoryDir: null };
  }

  return {
    name,
    rootDir: null,
    memoryDir: path.join(resolveProjectsRoot(options.projectsMemoryDir), name),
  };
}

export function detectProjectSkills(
  optionsOrProjectsMemoryDir: ProjectDetectionOptions | string = "projects-memory",
  cwd?: string,
): ProjectSkillInfo {
  const project = detectProject(optionsOrProjectsMemoryDir, cwd);
  return {
    ...project,
    skillsDir: project.memoryDir ? path.join(project.memoryDir, "skills") : null,
  };
}
