import assert from "node:assert/strict";
import test from "node:test";
import {
  MaterialLearningDomainError,
  projectMaterialLearningEvent,
  type MaterialLearningProjection,
} from "./material-learning";

function apply(
  previous: MaterialLearningProjection | null,
  page: number,
  totalPages = 4,
) {
  return projectMaterialLearningEvent({
    material: { type: "PDF", totalPages },
    previous,
    event: { type: "PRESENTATION_PAGE_VIEWED", page },
  });
}

test("progress is based on unique pages, not the largest client page", () => {
  const first = apply(null, 4);
  assert.equal(first.progressPercent, 25);
  assert.equal(first.maxPageSeen, 4);
  assert.equal(first.completed, false);

  const duplicate = apply(first, 4);
  assert.equal(duplicate.progressPercent, 25);

  const second = apply(duplicate, 1);
  const third = apply(second, 3);
  const complete = apply(third, 2);
  assert.equal(complete.progressPercent, 100);
  assert.equal(complete.completed, true);
});

test("server descriptor clamps a page and controls total pages", () => {
  const result = apply(null, 999, 10);
  assert.deepEqual(result.viewedPages, [10]);
  assert.equal(result.totalPages, 10);
  assert.equal(result.progressPercent, 10);
});

test("opening starts a regular material and explicit completion completes it", () => {
  const opened = projectMaterialLearningEvent({
    material: { type: "VIDEO", totalPages: 1 },
    previous: null,
    event: { type: "MATERIAL_OPENED" },
  });
  assert.equal(opened.status, "IN_PROGRESS");
  assert.equal(opened.progressPercent, 1);

  const completed = projectMaterialLearningEvent({
    material: { type: "VIDEO", totalPages: 1 },
    previous: opened,
    event: { type: "MATERIAL_COMPLETED" },
  });
  assert.equal(completed.status, "COMPLETED");
});

test("a presentation cannot be completed by a generic client event", () => {
  assert.throws(
    () => projectMaterialLearningEvent({
      material: { type: "PDF", totalPages: 3 },
      previous: null,
      event: { type: "MATERIAL_COMPLETED" },
    }),
    MaterialLearningDomainError,
  );
});
