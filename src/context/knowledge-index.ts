import * as fs from "node:fs";
import * as path from "node:path";

export type KnowledgeStatus = "active" | "stale" | "archived" | "unknown";

export interface KnowledgeIndexEntry {
  title: string;
  sourcePath: string;
  resolvedPath: string;
  purpose: string;
  whenToRead: string;
  status: KnowledgeStatus;
  lastReviewed: string;
  supersedes: string;
  supersededBy: string;
}

export interface KnowledgeIndexInspection {
  indexPath: string;
  exists: boolean;
  entries: KnowledgeIndexEntry[];
  brokenPaths: KnowledgeIndexEntry[];
  duplicateTitles: string[];
  duplicatePaths: string[];
  staleEntries: KnowledgeIndexEntry[];
  errors: string[];
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeStatus(value: string): KnowledgeStatus {
  const lower = value.trim().toLowerCase();
  if (lower === "active" || lower === "stale" || lower === "archived") return lower;
  return "unknown";
}

function resolveKnowledgePath(scopeRoot: string, sourcePath: string): string {
  const cleaned = sourcePath.trim();
  if (!cleaned) return "";
  if (path.isAbsolute(cleaned)) return path.normalize(cleaned);
  return path.resolve(scopeRoot, cleaned);
}

function uniqueRepeated(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

export function parseKnowledgeIndex(markdown: string, scopeRoot: string): KnowledgeIndexEntry[] {
  const entries: KnowledgeIndexEntry[] = [];
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 8 || isSeparatorRow(cells)) continue;
    if (cells[0].toLowerCase() === "title" && cells[1].toLowerCase() === "path") continue;

    const [
      title,
      sourcePath,
      purpose,
      whenToRead,
      status,
      lastReviewed,
      supersedes,
      supersededBy,
    ] = cells;

    if (!title && !sourcePath) continue;

    entries.push({
      title,
      sourcePath,
      resolvedPath: resolveKnowledgePath(scopeRoot, sourcePath),
      purpose,
      whenToRead,
      status: normalizeStatus(status),
      lastReviewed,
      supersedes,
      supersededBy,
    });
  }

  return entries;
}

export function inspectKnowledgeIndex(indexPath: string, scopeRoot: string): KnowledgeIndexInspection {
  const inspection: KnowledgeIndexInspection = {
    indexPath,
    exists: fs.existsSync(indexPath),
    entries: [],
    brokenPaths: [],
    duplicateTitles: [],
    duplicatePaths: [],
    staleEntries: [],
    errors: [],
  };

  if (!inspection.exists) return inspection;

  try {
    inspection.entries = parseKnowledgeIndex(fs.readFileSync(indexPath, "utf-8"), scopeRoot);
    inspection.brokenPaths = inspection.entries.filter((entry) => {
      if (!entry.resolvedPath) return false;
      return !fs.existsSync(entry.resolvedPath);
    });
    inspection.duplicateTitles = uniqueRepeated(
      inspection.entries
        .filter((entry) => entry.status !== "archived")
        .map((entry) => entry.title.toLowerCase()),
    );
    inspection.duplicatePaths = uniqueRepeated(
      inspection.entries
        .filter((entry) => entry.status !== "archived")
        .map((entry) => entry.resolvedPath),
    );
    inspection.staleEntries = inspection.entries.filter((entry) => entry.status === "stale");
  } catch (err) {
    inspection.errors.push(err instanceof Error ? err.message : String(err));
  }

  return inspection;
}

export function summarizeKnowledgeInspection(label: string, inspection: KnowledgeIndexInspection): string[] {
  if (!inspection.exists) {
    return [`${label}: missing ${inspection.indexPath}`];
  }

  const lines = [`${label}: ok ${inspection.indexPath} (${inspection.entries.length} entries)`];
  if (inspection.errors.length > 0) {
    lines.push(`${label} errors: ${inspection.errors.join("; ")}`);
  }
  if (inspection.brokenPaths.length > 0) {
    lines.push(`${label} broken paths: ${inspection.brokenPaths.map((entry) => entry.sourcePath).join(", ")}`);
  } else {
    lines.push(`${label} broken paths: none`);
  }
  if (inspection.duplicateTitles.length > 0 || inspection.duplicatePaths.length > 0) {
    const duplicates = [
      ...inspection.duplicateTitles.map((title) => `title:${title}`),
      ...inspection.duplicatePaths.map((entryPath) => `path:${entryPath}`),
    ];
    lines.push(`${label} duplicate Source of Truth: ${duplicates.join(", ")}`);
  } else {
    lines.push(`${label} duplicate Source of Truth: none`);
  }
  if (inspection.staleEntries.length > 0) {
    lines.push(`${label} stale documents: ${inspection.staleEntries.map((entry) => entry.title).join(", ")}`);
  } else {
    lines.push(`${label} stale documents: none`);
  }
  return lines;
}

