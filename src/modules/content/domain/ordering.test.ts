import assert from "node:assert/strict";
import test from "node:test";
import { ContentOrderingError, reorderContentItem } from "./ordering";

test("moves an item only inside its module and normalizes global indexes", () => {
  assert.deepEqual(reorderContentItem({
    moduleIds: ["module-a", "module-b"],
    items: [
      { id: "a1", moduleId: "module-a" },
      { id: "b1", moduleId: "module-b" },
      { id: "a2", moduleId: "module-a" },
      { id: "loose", moduleId: null },
    ],
    itemId: "a2",
    direction: "up",
  }), [
    { id: "a2", orderIndex: 0 },
    { id: "a1", orderIndex: 1 },
    { id: "b1", orderIndex: 2 },
    { id: "loose", orderIndex: 3 },
  ]);
});

test("rejects a move beyond the module boundary", () => {
  assert.throws(() => reorderContentItem({
    moduleIds: ["module-a"],
    items: [{ id: "a1", moduleId: "module-a" }],
    itemId: "a1",
    direction: "up",
  }), (error: unknown) => error instanceof ContentOrderingError && error.code === "NO_MOVE");
});
