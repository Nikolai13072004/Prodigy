import assert from "node:assert/strict";
import test from "node:test";
import { selectCourseStructureEditor } from "@/app/courses/[id]/manage/_queries/select-course-structure-editor";

test("selects only items and modules present in the management read model", () => {
  const result = selectCourseStructureEditor({
    items: [{ id: "item-1", title: "Intro" }],
    modules: [{ id: "module-1", title: "Start" }],
    selectedItemId: "item-1",
    selectedModuleId: "module-1",
  });
  assert.equal(result.selectedItem?.title, "Intro");
  assert.equal(result.selectedModule?.title, "Start");
});

test("does not manufacture editor state for stale URL identifiers", () => {
  const result = selectCourseStructureEditor({
    items: [{ id: "item-1" }],
    modules: [{ id: "module-1" }],
    selectedItemId: "missing-item",
    selectedModuleId: "missing-module",
  });
  assert.equal(result.selectedItem, null);
  assert.equal(result.selectedModule, null);
});
