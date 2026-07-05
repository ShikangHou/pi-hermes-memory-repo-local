import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  inspectKnowledgeIndex,
  parseKnowledgeIndex,
  summarizeKnowledgeInspection,
} from "../../src/context/knowledge-index.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-knowledge-index-"));
}

describe("knowledge-index", () => {
  it("parses semantic routing rows and resolves workspace-relative paths", () => {
    const root = makeTempDir();
    const entries = parseKnowledgeIndex([
      "| Title | Path | Purpose | When to Read | Status | Last Reviewed | Supersedes | Superseded By |",
      "|---|---|---|---|---|---|---|---|",
      "| Architecture | docs/ARCHITECTURE.md | System design | Architecture work | active | 2026-07-05 | | |",
    ].join("\n"), root);

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].title, "Architecture");
    assert.strictEqual(entries[0].status, "active");
    assert.strictEqual(entries[0].resolvedPath, path.join(root, "docs", "ARCHITECTURE.md"));
  });

  it("reports broken paths, duplicates, and stale entries", () => {
    const root = makeTempDir();
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "A.md"), "# A\n", "utf-8");
    const indexPath = path.join(root, ".pi", "knowledge", "INDEX.md");
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, [
      "| Title | Path | Purpose | When to Read | Status | Last Reviewed | Supersedes | Superseded By |",
      "|---|---|---|---|---|---|---|---|",
      "| Architecture | docs/A.md | One | A | active | 2026-07-05 | | |",
      "| Architecture | docs/missing.md | Two | B | active | 2026-07-05 | | |",
      "| Old Plan | docs/old.md | Three | C | stale | 2026-07-05 | | |",
    ].join("\n"), "utf-8");

    const inspection = inspectKnowledgeIndex(indexPath, root);

    assert.strictEqual(inspection.exists, true);
    assert.deepStrictEqual(inspection.duplicateTitles, ["architecture"]);
    assert.deepStrictEqual(inspection.brokenPaths.map((entry) => entry.sourcePath), ["docs/missing.md", "docs/old.md"]);
    assert.deepStrictEqual(inspection.staleEntries.map((entry) => entry.title), ["Old Plan"]);
  });

  it("summarizes missing and healthy indexes for doctor output", () => {
    const root = makeTempDir();
    const missing = inspectKnowledgeIndex(path.join(root, "missing.md"), root);
    assert.deepStrictEqual(summarizeKnowledgeInspection("Workspace Knowledge Index", missing), [
      `Workspace Knowledge Index: missing ${path.join(root, "missing.md")}`,
    ]);
  });
});

