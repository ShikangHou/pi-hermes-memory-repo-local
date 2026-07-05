import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideMemoryWrite } from "../../src/context/write-time-consistency.js";

describe("decideMemoryWrite", () => {
  it("detects package-manager updates in the same scope", () => {
    const decision = decideMemoryWrite("This repo uses pnpm.", ["This repo uses npm."]);
    assert.deepStrictEqual(decision, {
      type: "UPDATE",
      existing: "This repo uses npm.",
    });
  });

  it("skips unchanged package-manager facts", () => {
    const decision = decideMemoryWrite("This repository uses pnpm.", ["This repo uses pnpm."]);
    assert.deepStrictEqual(decision, {
      type: "UNCHANGED",
      existing: "This repo uses pnpm.",
    });
  });

  it("leaves unrelated memories as new", () => {
    assert.deepStrictEqual(decideMemoryWrite("Tests run with npm test.", []), { type: "NEW" });
  });
});
