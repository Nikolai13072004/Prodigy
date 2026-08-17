import assert from "node:assert/strict";
import test from "node:test";
import type {
  LearningAccessPolicy,
  LearningRepository,
  StoredMaterialProjection,
} from "./ports";
import {
  LearningApplicationError,
  createRecordMaterialLearningEvent,
} from "./record-material-learning-event";

const actor = { id: "user-1", roles: ["STUDENT"], permissions: ["courses.view"] };

function createRepository(): LearningRepository {
  let projection: StoredMaterialProjection = null;
  return {
    async findMaterial() {
      return { id: "material-1", courseId: "course-1", type: "PDF", totalSlides: 5 };
    },
    async saveEventAndProject({ project }) {
      const next = project(projection);
      projection = next;
      return next;
    },
  };
}

test("application service uses the server material descriptor", async () => {
  const accessPolicy: LearningAccessPolicy = { async canRecord() { return true; } };
  const record = createRecordMaterialLearningEvent({ repository: createRepository(), accessPolicy });

  const result = await record({
    actor,
    materialId: "material-1",
    event: { type: "PRESENTATION_PAGE_VIEWED", page: 5 },
  });

  assert.equal(result.totalPages, 5);
  assert.equal(result.progressPercent, 20);
  assert.equal(result.completed, false);
});

test("authorization is enforced inside the use case", async () => {
  const accessPolicy: LearningAccessPolicy = { async canRecord() { return false; } };
  const record = createRecordMaterialLearningEvent({ repository: createRepository(), accessPolicy });

  await assert.rejects(
    record({ actor, materialId: "material-1", event: { type: "MATERIAL_OPENED" } }),
    (error: unknown) => error instanceof LearningApplicationError && error.code === "FORBIDDEN",
  );
});
