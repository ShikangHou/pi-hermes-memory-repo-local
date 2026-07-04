import { afterEach, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import { addMemory } from '../../src/store/sqlite-memory-store.js';
import { registerMemorySearchTool } from '../../src/tools/memory-search-tool.js';

let ROOT_DIR = '';

afterEach(() => {
  if (ROOT_DIR) fs.rmSync(ROOT_DIR, { recursive: true, force: true });
  ROOT_DIR = '';
});

function makeDbManager(): DatabaseManager {
  ROOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-memory-search-tool-test-'));
  return new DatabaseManager(ROOT_DIR);
}

describe('registerMemorySearchTool', () => {
  it('returns a broader natural-language match when strict term matching misses', async () => {
    const dbManager = makeDbManager();
    addMemory(dbManager, "user's name is Naruto", 'user');

    let captured: any;
    const mockPi = {
      registerTool: (def: any) => {
        captured = def;
      },
    } as any;

    registerMemorySearchTool(mockPi, dbManager);

    const result = await captured.execute('tc-1', { query: 'name identity Naruto', target: 'user' });

    assert.strictEqual(result.details.success, true);
    assert.strictEqual(result.details.count, 1);
    assert.match(result.content[0].text, /Naruto/);

    dbManager.close();
  });

  it("defaults scope='all' to global plus current workspace only", async () => {
    const dbManager = makeDbManager();
    addMemory(dbManager, "shared auth convention", "memory", "current-workspace");
    addMemory(dbManager, "shared auth global preference", "memory", null);
    addMemory(dbManager, "shared auth other workspace", "memory", "other-workspace");

    let captured: any;
    const mockPi = {
      registerTool: (def: any) => {
        captured = def;
      },
    } as any;

    registerMemorySearchTool(mockPi, dbManager, "current-workspace");

    const result = await captured.execute("tc-1", { query: "shared auth", target: "memory" });

    assert.strictEqual(result.details.success, true);
    assert.strictEqual(result.details.count, 2);
    assert.match(result.content[0].text, /current-workspace/);
    assert.match(result.content[0].text, /global preference/);
    assert.doesNotMatch(result.content[0].text, /other workspace/);

    dbManager.close();
  });

  it("supports explicit workspace and global scopes", async () => {
    const dbManager = makeDbManager();
    addMemory(dbManager, "workspace scoped build note", "memory", "workspace-a");
    addMemory(dbManager, "global scoped build note", "memory", null);

    let captured: any;
    const mockPi = {
      registerTool: (def: any) => {
        captured = def;
      },
    } as any;

    registerMemorySearchTool(mockPi, dbManager, "workspace-a");

    const workspaceResult = await captured.execute("tc-1", { query: "scoped build", scope: "workspace" });
    assert.match(workspaceResult.content[0].text, /workspace scoped/);
    assert.doesNotMatch(workspaceResult.content[0].text, /global scoped/);

    const globalResult = await captured.execute("tc-2", { query: "scoped build", scope: "global" });
    assert.match(globalResult.content[0].text, /global scoped/);
    assert.doesNotMatch(globalResult.content[0].text, /workspace scoped/);

    dbManager.close();
  });
});
