export type MemoryWriteDecision =
  | { type: "NEW" }
  | { type: "UNCHANGED"; existing: string }
  | { type: "UPDATE"; existing: string }
  | { type: "REFINE"; existing: string; reason: string }
  | { type: "UNCERTAIN"; reason: string };

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
type PackageManager = typeof PACKAGE_MANAGERS[number];

interface PackageManagerFact {
  manager: PackageManager;
  subject: "workspace" | "global";
}

function uniqueManagers(text: string): PackageManager[] {
  const lower = text.toLowerCase();
  return PACKAGE_MANAGERS.filter((manager) => new RegExp(`\\b${manager}\\b`).test(lower));
}

function extractPackageManagerFact(text: string): PackageManagerFact | null {
  const managers = uniqueManagers(text);
  if (managers.length === 0) return null;
  if (managers.length > 1) return null;

  const lower = text.toLowerCase();
  if (!/\b(use|uses|using|package manager|包管理器)\b/.test(lower)) return null;

  const workspaceSignals = [
    /\b(this repo|this repository|this workspace|this project|repo|repository|workspace|project|codebase)\b/,
    /\b项目|仓库|工作区\b/,
  ];

  return {
    manager: managers[0],
    subject: workspaceSignals.some((pattern) => pattern.test(lower)) ? "workspace" : "global",
  };
}

export function decideMemoryWrite(candidate: string, existingEntries: string[]): MemoryWriteDecision {
  const candidateFact = extractPackageManagerFact(candidate);
  if (!candidateFact) return { type: "NEW" };

  const candidateManagers = uniqueManagers(candidate);
  if (candidateManagers.length > 1) {
    return {
      type: "UNCERTAIN",
      reason: "Candidate mentions multiple package managers; preserve it through normal agent workflow instead of automatic memory write.",
    };
  }

  for (const existing of existingEntries) {
    const existingFact = extractPackageManagerFact(existing);
    if (!existingFact) continue;
    if (existingFact.subject !== candidateFact.subject) continue;

    if (existingFact.manager === candidateFact.manager) {
      return { type: "UNCHANGED", existing };
    }

    return { type: "UPDATE", existing };
  }

  return { type: "NEW" };
}
