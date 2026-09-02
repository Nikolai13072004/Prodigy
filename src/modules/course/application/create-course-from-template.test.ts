import assert from "node:assert/strict";
import { test } from "node:test";
import { createCreateCourseFromTemplate } from "./create-course-from-template";
import { CourseCreationApplicationError } from "./creation-errors";
import type {
  CourseCreationEffects,
  CourseCreationRepository,
  CreateCourseItemInput,
} from "./creation-ports";

function makeRepository() {
  const state = {
    modules: [] as string[],
    items: [] as CreateCourseItemInput[],
    effects: [] as CourseCreationEffects[],
  };
  const repository: CourseCreationRepository = {
    async findCourseForCopy() {
      return null;
    },
    async transact(execute) {
      return execute({
        async createCourse(data) {
          return { id: "crs-1", title: data.title };
        },
        async createModule(data) {
          state.modules.push(data.title);
          return { id: `m-${state.modules.length}` };
        },
        async createItem(data) {
          state.items.push(data);
          return { id: `i-${state.items.length}`, quizId: data.quiz ? "q-1" : null };
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      });
    },
  };
  return { repository, state };
}

const ACTOR = { id: "u1", login: null, name: null };
const AUDIT = { ipAddress: null, userAgent: null };
const DATA = {
  title: "T",
  description: "D",
  category: null,
  difficultyLevel: null,
  durationMinutes: null,
  thumbnailUrl: null,
  coverUrl: null,
  ownerId: "u1",
};

test("шаблон presentation_with_quiz: модули и элементы разворачиваются", async () => {
  const { repository, state } = makeRepository();
  const create = createCreateCourseFromTemplate({ repository });
  const result = await create({
    data: DATA,
    templateKey: "presentation_with_quiz",
    templateLabel: "Презентация + тест",
    actor: ACTOR,
    audit: AUDIT,
  });
  assert.equal(result.courseId, "crs-1");
  assert.ok(state.modules.length >= 1, "хотя бы один модуль по blueprint");
  assert.ok(state.items.length >= 1, "хотя бы один элемент по blueprint");
  assert.equal(state.effects[0].audit?.action, "courses:create_from_template");
});

test("пустой title → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository();
  const create = createCreateCourseFromTemplate({ repository });
  await assert.rejects(
    create({
      data: { ...DATA, title: "" },
      templateKey: "presentation_with_quiz",
      templateLabel: "…",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof CourseCreationApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
  assert.equal(state.items.length, 0);
});
