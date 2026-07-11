import { DatabaseManager } from './db.js';
import { buildFallbackFts5Query, isFts5QueryError, normalizeFts5Query } from './fts-query.js';
import { normalizeMemoryLookupText } from './memory-lookup.js';
import type { MemoryCategory } from '../types.js';

const MEMORY_SELECT_COLUMNS = `
  id,
  memory_uid,
  source_file,
  source_hash,
  project,
  workspace_id,
  workspace_name,
  target,
  category,
  content,
  failure_reason,
  tool_state,
  corrected_to,
  created,
  last_referenced
`;

const FAILURE_CATEGORY_SET = new Set<MemoryCategory>([
  'failure',
  'correction',
  'insight',
  'preference',
  'convention',
  'tool-quirk',
]);

/**
 * A memory entry stored in SQLite.
 */
export interface SqliteMemoryEntry {
  id: number;
  memoryUid: string | null;
  sourceFile: string | null;
  sourceHash: string | null;
  project: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  target: 'memory' | 'user' | 'failure';
  category: MemoryCategory | null;
  content: string;
  failureReason: string | null;
  toolState: string | null;
  correctedTo: string | null;
  created: string;
  lastReferenced: string;
}

export interface SqliteMemorySyncInput {
  content: string;
  target: 'memory' | 'user' | 'failure';
  project?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  category?: MemoryCategory | null;
  failureReason?: string | null;
  toolState?: string | null;
  correctedTo?: string | null;
  created?: string | null;
  lastReferenced?: string | null;
  memoryUid?: string | null;
  sourceFile?: string | null;
  sourceHash?: string | null;
}

export interface SqliteMemorySyncResult {
  action: 'inserted' | 'existing';
  entry: SqliteMemoryEntry;
}

export interface SqliteMemoryUpdateResult {
  matched: number;
  updated: number;
  entries: SqliteMemoryEntry[];
}

export interface SqliteMemoryRemoveResult {
  matched: number;
  removed: number;
}

export interface SqliteMemoryRemoveOptions {
  target: 'memory' | 'user' | 'failure';
  project?: string | null;
  workspaceId?: string | null;
}

export interface ParsedMarkdownMemoryEntry extends SqliteMemorySyncInput {}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function normalizeNullable(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCategory(value?: MemoryCategory | null): MemoryCategory | null {
  return value ?? null;
}

function mapRow(row: {
  id: number;
  memory_uid?: string | null;
  source_file?: string | null;
  source_hash?: string | null;
  project: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
  target: string;
  category: string | null;
  content: string;
  failure_reason: string | null;
  tool_state: string | null;
  corrected_to: string | null;
  created: string;
  last_referenced: string;
}): SqliteMemoryEntry {
  return {
    id: row.id,
    memoryUid: row.memory_uid ?? null,
    sourceFile: row.source_file ?? null,
    sourceHash: row.source_hash ?? null,
    project: row.project,
    workspaceId: row.workspace_id ?? null,
    workspaceName: row.workspace_name ?? null,
    target: row.target as 'memory' | 'user' | 'failure',
    category: row.category as MemoryCategory | null,
    content: row.content,
    failureReason: row.failure_reason,
    toolState: row.tool_state,
    correctedTo: row.corrected_to,
    created: row.created,
    lastReferenced: row.last_referenced,
  };
}

function buildScopeConditions(
  params: unknown[],
  target?: string,
  project?: string | null,
  category?: MemoryCategory | null,
  workspaceId?: string | null,
): string[] {
  const conditions: string[] = [];

  if (target) {
    conditions.push('target = ?');
    params.push(target);
  }

  if (workspaceId !== undefined) {
    if (workspaceId === null) {
      conditions.push('workspace_id IS NULL');
    } else {
      conditions.push('workspace_id = ?');
      params.push(workspaceId);
    }
  } else if (project !== undefined) {
    if (project === null) {
      conditions.push('project IS NULL');
    } else {
      conditions.push('project = ?');
      params.push(project);
    }
  }

  if (category !== undefined) {
    if (category === null) {
      conditions.push('category IS NULL');
    } else {
      conditions.push('category = ?');
      params.push(category);
    }
  }

  return conditions;
}

function getMemoryById(dbManager: DatabaseManager, id: number): SqliteMemoryEntry | null {
  const db = dbManager.getDb();
  const row = db.prepare(`
    SELECT ${MEMORY_SELECT_COLUMNS}
    FROM memories
    WHERE id = ?
  `).get(id) as {
    id: number;
    project: string | null;
    target: string;
    category: string | null;
    content: string;
    failure_reason: string | null;
    tool_state: string | null;
    corrected_to: string | null;
    created: string;
    last_referenced: string;
  } | undefined;

  return row ? mapRow(row) : null;
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

function parseMetadataComment(raw: string): { text: string; memoryUid?: string; created: string; lastReferenced: string } {
  const current = raw.match(/^(.*?)\s*<!--\s*id=([^,]+),\s*created=([^,]+),\s*updated=([^,]+),\s*last=([^>]+)\s*-->\s*$/);
  if (current) {
    return {
      text: current[1].trim(),
      memoryUid: current[2].trim(),
      created: current[3].trim(),
      lastReferenced: current[5].trim(),
    };
  }
  const legacy = raw.match(/^(.*?)\s*<!--\s*created=([^,]+),\s*last=([^>]+)\s*-->\s*$/);
  if (legacy) {
    return {
      text: legacy[1].trim(),
      created: legacy[2].trim(),
      lastReferenced: legacy[3].trim(),
    };
  }

  const fallback = today();
  return {
    text: raw.trim(),
    created: fallback,
    lastReferenced: fallback,
  };
}

/**
 * Add a memory entry to the SQLite store.
 */
export function addMemory(
  dbManager: DatabaseManager,
  content: string,
  target: 'memory' | 'user' | 'failure' = 'memory',
  project: string | null = null,
  category: MemoryCategory | null = null,
  failureReason: string | null = null,
  toolState: string | null = null,
  correctedTo: string | null = null,
  created = today(),
  lastReferenced = created,
  workspaceId: string | null = null,
  workspaceName: string | null = null,
  memoryUid: string | null = null,
  sourceFile: string | null = null,
  sourceHash: string | null = null,
): SqliteMemoryEntry {
  const db = dbManager.getDb();

  const result = db.prepare(`
    INSERT INTO memories (memory_uid, source_file, source_hash, project, workspace_id, workspace_name, target, category, content, failure_reason, tool_state, corrected_to, created, last_referenced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(memoryUid, sourceFile, sourceHash, project, workspaceId, workspaceName, target, category, content, failureReason, toolState, correctedTo, created, lastReferenced);

  return {
    id: Number(result.lastInsertRowid),
    memoryUid,
    sourceFile,
    sourceHash,
    project,
    workspaceId,
    workspaceName,
    target,
    category,
    content,
    failureReason,
    toolState,
    correctedTo,
    created,
    lastReferenced,
  };
}

/**
 * Build the visible failure-memory text stored in Markdown.
 */
export function formatFailureMemoryContent(
  content: string,
  options: {
    category: MemoryCategory;
    failureReason?: string | null;
    toolState?: string | null;
    correctedTo?: string | null;
    project?: string | null;
  }
): string {
  const categoryTag = `[${options.category}]`;
  const parts = [`${categoryTag} ${content.trim()}`.trim()];
  if (options.failureReason) parts.push(`Failed: ${options.failureReason}`);
  if (options.toolState) parts.push(`Tool state: ${options.toolState}`);
  if (options.correctedTo) parts.push(`Corrected to: ${options.correctedTo}`);
  if (options.project) parts.push(`Project: ${options.project}`);
  return parts.join(' — ');
}

/**
 * Parse a Markdown memory entry into SQLite sync fields.
 * Best-effort only: if failure metadata cannot be fully reconstructed,
 * content is still imported and available for search.
 */
export function parseMarkdownMemoryEntry(
  rawEntry: string,
  target: 'memory' | 'user' | 'failure',
  project: string | null = null,
): ParsedMarkdownMemoryEntry {
  const { text, memoryUid, created, lastReferenced } = parseMetadataComment(rawEntry);
  const parsedProject = normalizeNullable(project);

  if (target !== 'failure') {
    return {
      content: text,
      target,
      project: parsedProject,
      created,
      lastReferenced,
      memoryUid,
    };
  }

  let category: MemoryCategory | null = null;
  let failureReason: string | null = null;
  let toolState: string | null = null;
  let correctedTo: string | null = null;

  const categoryMatch = text.match(/^\[([^\]]+)\]\s+/);
  if (categoryMatch && FAILURE_CATEGORY_SET.has(categoryMatch[1] as MemoryCategory)) {
    category = categoryMatch[1] as MemoryCategory;
  }

  const segments = text.split(' — ');
  for (const segment of segments.slice(1)) {
    if (segment.startsWith('Failed: ') && !failureReason) {
      failureReason = segment.slice('Failed: '.length).trim() || null;
      continue;
    }
    if (segment.startsWith('Tool state: ') && !toolState) {
      toolState = segment.slice('Tool state: '.length).trim() || null;
      continue;
    }
    if (segment.startsWith('Corrected to: ') && !correctedTo) {
      correctedTo = segment.slice('Corrected to: '.length).trim() || null;
    }
  }

  return {
    content: text,
    target: 'failure',
    project: parsedProject,
    category,
    failureReason,
    toolState,
    correctedTo,
    created,
    lastReferenced,
    memoryUid,
  };
}

/**
 * Idempotently sync a Markdown-backed memory entry into SQLite.
 * Duplicate identity is exact: project + target + category + content.
 */
export function syncMemoryEntry(
  dbManager: DatabaseManager,
  input: SqliteMemorySyncInput,
): SqliteMemorySyncResult {
  const db = dbManager.getDb();
  const content = input.content.trim();
  const project = normalizeNullable(input.project);
  const workspaceId = normalizeNullable(input.workspaceId);
  const workspaceName = normalizeNullable(input.workspaceName);
  const category = normalizeCategory(input.category);
  const failureReason = normalizeNullable(input.failureReason);
  const toolState = normalizeNullable(input.toolState);
  const correctedTo = normalizeNullable(input.correctedTo);
  const created = input.created?.trim() || today();
  const lastReferenced = input.lastReferenced?.trim() || created;
  const memoryUid = normalizeNullable(input.memoryUid);
  const sourceFile = normalizeNullable(input.sourceFile);
  const sourceHash = normalizeNullable(input.sourceHash);

  const params: unknown[] = [];
  const conditions = memoryUid
    ? ['memory_uid = ?']
    : buildScopeConditions(params, input.target, project, category, input.workspaceId === undefined ? undefined : workspaceId);
  if (memoryUid) params.push(memoryUid);
  else {
    conditions.push('content = ?');
    params.push(content);
  }

  const existing = db.prepare(`
    SELECT ${MEMORY_SELECT_COLUMNS}
    FROM memories
    WHERE ${conditions.join(' AND ')}
    ORDER BY id ASC
    LIMIT 1
  `).get(...params) as {
    id: number;
    project: string | null;
    target: string;
    category: string | null;
    content: string;
    failure_reason: string | null;
    tool_state: string | null;
    corrected_to: string | null;
    created: string;
    last_referenced: string;
  } | undefined;

  if (!existing) {
    return {
      action: 'inserted',
      entry: addMemory(
        dbManager,
        content,
        input.target,
        project,
        category,
        failureReason,
        toolState,
        correctedTo,
        created,
        lastReferenced,
        workspaceId,
        workspaceName,
        memoryUid,
        sourceFile,
        sourceHash,
      ),
    };
  }

  const updatedCreated = minDate(existing.created, created);
  const updatedLastReferenced = maxDate(existing.last_referenced, lastReferenced);
  const updatedCategory = (existing.category as MemoryCategory | null) ?? category;
  const updatedFailureReason = existing.failure_reason ?? failureReason;
  const updatedToolState = existing.tool_state ?? toolState;
  const updatedCorrectedTo = existing.corrected_to ?? correctedTo;

  db.prepare(`
    UPDATE memories
    SET content = ?, category = ?, failure_reason = ?, tool_state = ?, corrected_to = ?, created = ?, last_referenced = ?,
        memory_uid = COALESCE(memory_uid, ?), source_file = COALESCE(?, source_file), source_hash = COALESCE(?, source_hash),
        project = ?, workspace_id = ?, workspace_name = ?, target = ?
    WHERE id = ?
  `).run(
    content,
    updatedCategory,
    updatedFailureReason,
    updatedToolState,
    updatedCorrectedTo,
    updatedCreated,
    updatedLastReferenced,
    memoryUid,
    sourceFile,
    sourceHash,
    project,
    workspaceId,
    workspaceName,
    input.target,
    existing.id,
  );

  return {
    action: 'existing',
    entry: getMemoryById(dbManager, existing.id)!,
  };
}

/**
 * Best-effort substring replacement for SQLite-backed memory sync.
 * Updates all matches in the scoped slice to recover from prior duplicate rows.
 */
export function replaceSyncedMemories(
  dbManager: DatabaseManager,
  oldText: string,
  updates: {
    content: string;
    target: 'memory' | 'user' | 'failure';
    project?: string | null;
    workspaceId?: string | null;
    category?: MemoryCategory | null;
    failureReason?: string | null;
    toolState?: string | null;
    correctedTo?: string | null;
    lastReferenced?: string | null;
  },
): SqliteMemoryUpdateResult {
  const db = dbManager.getDb();
  const normalizedOldText = normalizeMemoryLookupText(oldText);
  if (!normalizedOldText) return { matched: 0, updated: 0, entries: [] };
  const params: unknown[] = [];
  const conditions = buildScopeConditions(params, updates.target, updates.project ?? undefined, undefined, updates.workspaceId);
  conditions.push(`content LIKE ? ESCAPE '\\'`);
  params.push(`%${escapeLikePattern(normalizedOldText)}%`);

  const rows = db.prepare(`
    SELECT ${MEMORY_SELECT_COLUMNS}
    FROM memories
    WHERE ${conditions.join(' AND ')}
    ORDER BY id ASC
  `).all(...params) as Array<{
    id: number;
    project: string | null;
    target: string;
    category: string | null;
    content: string;
    failure_reason: string | null;
    tool_state: string | null;
    corrected_to: string | null;
    created: string;
    last_referenced: string;
  }>;

  if (rows.length === 0) {
    return { matched: 0, updated: 0, entries: [] };
  }

  const nextLastReferenced = updates.lastReferenced?.trim() || today();

  for (const row of rows) {
    db.prepare(`
      UPDATE memories
      SET content = ?,
          category = ?,
          failure_reason = ?,
          tool_state = ?,
          corrected_to = ?,
          last_referenced = ?
      WHERE id = ?
    `).run(
      updates.content.trim(),
      updates.category === undefined ? row.category : updates.category,
      updates.failureReason === undefined ? row.failure_reason : normalizeNullable(updates.failureReason),
      updates.toolState === undefined ? row.tool_state : normalizeNullable(updates.toolState),
      updates.correctedTo === undefined ? row.corrected_to : normalizeNullable(updates.correctedTo),
      nextLastReferenced,
      row.id,
    );
  }

  return {
    matched: rows.length,
    updated: rows.length,
    entries: rows
      .map((row) => getMemoryById(dbManager, row.id))
      .filter((entry): entry is SqliteMemoryEntry => entry !== null),
  };
}

/**
 * Best-effort substring removal for SQLite-backed memory sync.
 * Deletes all matches in the scoped slice to recover from prior duplicate rows.
 */
export function removeSyncedMemories(
  dbManager: DatabaseManager,
  oldText: string,
  options: SqliteMemoryRemoveOptions,
): SqliteMemoryRemoveResult {
  const db = dbManager.getDb();
  const normalizedOldText = normalizeMemoryLookupText(oldText);
  if (!normalizedOldText) return { matched: 0, removed: 0 };
  const params: unknown[] = [];
  const conditions = buildScopeConditions(params, options.target, options.project ?? undefined, undefined, options.workspaceId);
  conditions.push(`content LIKE ? ESCAPE '\\'`);
  params.push(`%${escapeLikePattern(normalizedOldText)}%`);

  const matchingIds = db.prepare(`
    SELECT id
    FROM memories
    WHERE ${conditions.join(' AND ')}
  `).all(...params) as Array<{ id: number }>;

  if (matchingIds.length === 0) {
    return { matched: 0, removed: 0 };
  }

  const deleteParams = matchingIds.map((row) => row.id);
  const placeholders = deleteParams.map(() => '?').join(', ');
  const result = db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...deleteParams);

  return {
    matched: matchingIds.length,
    removed: result.changes,
  };
}

/**
 * Exact removal for Markdown entries whose full content is known.
 * Used for FIFO eviction cleanup, where substring matching could remove
 * unrelated SQLite mirror rows that merely contain the evicted text.
 */
export function removeExactSyncedMemories(
  dbManager: DatabaseManager,
  content: string,
  options: SqliteMemoryRemoveOptions,
): SqliteMemoryRemoveResult {
  const db = dbManager.getDb();
  const params: unknown[] = [];
  const conditions = buildScopeConditions(params, options.target, options.project ?? undefined, undefined, options.workspaceId);
  conditions.push('content = ?');
  params.push(content.trim());

  const matchingIds = db.prepare(`
    SELECT id
    FROM memories
    WHERE ${conditions.join(' AND ')}
  `).all(...params) as Array<{ id: number }>;

  if (matchingIds.length === 0) {
    return { matched: 0, removed: 0 };
  }

  const deleteParams = matchingIds.map((row) => row.id);
  const placeholders = deleteParams.map(() => '?').join(', ');
  const result = db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...deleteParams);

  return {
    matched: matchingIds.length,
    removed: result.changes,
  };
}

/**
 * Search memories using FTS5.
 */
export function searchMemories(
  dbManager: DatabaseManager,
  query: string,
  options: { project?: string | null; workspaceId?: string | null; target?: string; category?: MemoryCategory; limit?: number } = {}
): SqliteMemoryEntry[] {
  if (query.trim().length === 0) {
    return [];
  }

  const db = dbManager.getDb();
  const { project, workspaceId, target, category, limit = 10 } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  // FTS5 match via subquery with escaped query
  const normalizedQuery = normalizeFts5Query(query);
  if (normalizedQuery.length === 0) {
    return [];
  }

  const runSearch = (matchQuery: string): SqliteMemoryEntry[] => {
    const conditions: string[] = [];
    const params: unknown[] = [];

    conditions.push('m.id IN (SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?)');
    params.push(matchQuery);

    if (workspaceId !== undefined) {
      if (workspaceId === null) {
        conditions.push('m.workspace_id IS NULL');
      } else {
        conditions.push('m.workspace_id = ?');
        params.push(workspaceId);
      }
    } else if (project !== undefined) {
      if (project === null) {
        conditions.push('m.project IS NULL');
      } else {
        conditions.push('m.project = ?');
        params.push(project);
      }
    }

    if (target) {
      conditions.push('m.target = ?');
      params.push(target);
    }

    if (category) {
      conditions.push('m.category = ?');
      params.push(category);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT ${MEMORY_SELECT_COLUMNS}
      FROM memories m
      ${whereClause}
      ORDER BY m.last_referenced DESC
      LIMIT ?
    `;

    try {
      const rows = db.prepare(sql).all(...params, limit) as Array<{
        id: number;
        project: string | null;
        target: string;
        category: string | null;
        content: string;
        failure_reason: string | null;
        tool_state: string | null;
        corrected_to: string | null;
        created: string;
        last_referenced: string;
      }>;

      return rows.map(mapRow);
    } catch (err) {
      if (isFts5QueryError(err)) {
        return [];
      }
      throw err;
    }
  };

  const exactResults = runSearch(normalizedQuery);
  if (exactResults.length > 0) {
    return exactResults;
  }

  const fallbackQuery = buildFallbackFts5Query(query);
  if (!fallbackQuery || fallbackQuery === normalizedQuery) {
    return exactResults;
  }

  return runSearch(fallbackQuery);
}

export function recordMemoryAccess(dbManager: DatabaseManager, ids: number[], accessedAt = new Date()): void {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return;
  const placeholders = unique.map(() => '?').join(', ');
  dbManager.getDb().prepare(`UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id IN (${placeholders})`)
    .run(accessedAt.toISOString(), ...unique);
}

/**
 * Get all memories, optionally filtered.
 */
export function getMemories(
  dbManager: DatabaseManager,
  options: { project?: string | null; workspaceId?: string | null; target?: string; category?: MemoryCategory } = {}
): SqliteMemoryEntry[] {
  const db = dbManager.getDb();
  const { project, workspaceId, target, category } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (workspaceId !== undefined) {
    if (workspaceId === null) {
      conditions.push('workspace_id IS NULL');
    } else {
      conditions.push('workspace_id = ?');
      params.push(workspaceId);
    }
  } else if (project !== undefined) {
    if (project === null) {
      conditions.push('project IS NULL');
    } else {
      conditions.push('project = ?');
      params.push(project);
    }
  }

  if (target) {
    conditions.push('target = ?');
    params.push(target);
  }

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT ${MEMORY_SELECT_COLUMNS}
    FROM memories
    ${whereClause}
    ORDER BY last_referenced DESC
  `).all(...params) as Array<{
    id: number;
    project: string | null;
    target: string;
    category: string | null;
    content: string;
    failure_reason: string | null;
    tool_state: string | null;
    corrected_to: string | null;
    created: string;
    last_referenced: string;
  }>;

  return rows.map(mapRow);
}

/**
 * Remove a memory by ID.
 */
export function removeMemory(dbManager: DatabaseManager, id: number): boolean {
  const db = dbManager.getDb();
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Get recent failure memories (last N days).
 */
export function getRecentFailures(
  dbManager: DatabaseManager,
  maxAgeDays = 7,
  project?: string | null
): SqliteMemoryEntry[] {
  const db = dbManager.getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const conditions: string[] = ['target = ?', 'created >= ?'];
  const params: unknown[] = ['failure', cutoffStr];

  if (project !== undefined) {
    if (project === null) {
      conditions.push('project IS NULL');
    } else {
      conditions.push('(project = ? OR project IS NULL)');
      params.push(project);
    }
  }

  const rows = db.prepare(`
    SELECT ${MEMORY_SELECT_COLUMNS}
    FROM memories
    WHERE ${conditions.join(' AND ')}
    ORDER BY created DESC
    LIMIT 5
  `).all(...params) as Array<{
    id: number;
    project: string | null;
    target: string;
    category: string | null;
    content: string;
    failure_reason: string | null;
    tool_state: string | null;
    corrected_to: string | null;
    created: string;
    last_referenced: string;
  }>;

  return rows.map(mapRow);
}

/**
 * Update a memory's last_referenced date.
 */
export function touchMemory(dbManager: DatabaseManager, id: number): void {
  const db = dbManager.getDb();
  db.prepare('UPDATE memories SET last_referenced = ? WHERE id = ?').run(today(), id);
}

/**
 * Get memory statistics.
 */
export function getMemoryStats(dbManager: DatabaseManager): {
  total: number;
  byProject: { project: string | null; count: number }[];
  byTarget: { target: string; count: number }[];
} {
  const db = dbManager.getDb();

  const total = (db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number }).count;

  const byProject = db.prepare(`
    SELECT project, COUNT(*) as count
    FROM memories
    GROUP BY project
    ORDER BY count DESC
  `).all() as { project: string | null; count: number }[];

  const byTarget = db.prepare(`
    SELECT target, COUNT(*) as count
    FROM memories
    GROUP BY target
    ORDER BY count DESC
  `).all() as { target: string; count: number }[];

  return { total, byProject, byTarget };
}
