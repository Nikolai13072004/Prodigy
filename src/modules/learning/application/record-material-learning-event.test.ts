import assert from "node:assert/strict";
import test from "node:test";
import type {
  LearningAccessPolicy,
  LearningMaterialRecord,
  LearningRepository,
  StoredMaterialProjection,
} from "./ports";
import {
  LearningApplicationError,
  createRecordMaterialLearningEvent,
} from "./record-material-learning-event";

const actor = { id: "user-1", roles: ["STUDENT"], permissions: ["courses.view"] };

function createRepository(material?: Partial<LearningMaterialRecord>): LearningRepository {
  let stored: StoredMaterialProjection = null;
  return {
    async findMaterial() {
      return {
        id: "material-1",
        courseId: "course-1",
        type: "PDF",
        totalSlides: 5,
        isRequired: false,
        ...material,
      };
    },
    async saveEventAndProject({ project }) {
      const previousProgressPercent = stored?.progressPercent ?? null;
      const next = project(stored);
      stored = next;
      return { projection: next, previousProgressPercent };
    },
  };
}

const allowPolicy: LearningAccessPolicy = { async canRecord() { return true; } };

test("application service uses the server material descriptor", async () => {
  const record = createRecordMaterialLearningEvent({ repository: createRepository(), accessPolicy: allowPolicy });

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

test("хук завершения вызывается один раз при переходе обязательного материала через 100%", async () => {
  const calls: Array<{ userId: string; courseId: string }> = [];
  const repository = createRepository({ type: "TEXT", totalSlides: null, isRequired: true });
  const record = createRecordMaterialLearningEvent({
    repository,
    accessPolicy: allowPolicy,
    onCourseProgressAdvanced: async (args) => { calls.push(args); },
  });

  await record({ actor, materialId: "material-1", event: { type: "MATERIAL_COMPLETED" } });
  assert.equal(calls.length, 1, "первый переход через 100% — вызов");
  assert.deepEqual(calls[0], { userId: "user-1", courseId: "course-1" });

  // повторное завершение того же материала — уже был 100%, хук не зовём
  await record({ actor, materialId: "material-1", event: { type: "MATERIAL_COMPLETED" } });
  assert.equal(calls.length, 1, "повторное событие не триггерит выдачу");
});

test("хук не вызывается для необязательного материала", async () => {
  const calls: unknown[] = [];
  const record = createRecordMaterialLearningEvent({
    repository: createRepository({ type: "TEXT", totalSlides: null, isRequired: false }),
    accessPolicy: allowPolicy,
    onCourseProgressAdvanced: async (args) => { calls.push(args); },
  });

  await record({ actor, materialId: "material-1", event: { type: "MATERIAL_COMPLETED" } });
  assert.equal(calls.length, 0);
});

test("сбой выдачи сертификата не роняет сохранение прогресса", async () => {
  const record = createRecordMaterialLearningEvent({
    repository: createRepository({ type: "TEXT", totalSlides: null, isRequired: true }),
    accessPolicy: allowPolicy,
    onCourseProgressAdvanced: async () => { throw new Error("выдача упала"); },
  });

  // прогресс всё равно сохраняется и возвращается, ошибка проглочена
  const result = await record({ actor, materialId: "material-1", event: { type: "MATERIAL_COMPLETED" } });
  assert.equal(result.completed, true);
  assert.equal(result.progressPercent, 100);
});
