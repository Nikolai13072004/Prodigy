import assert from "node:assert/strict";
import { test } from "node:test";
import { createCreateCourse } from "./create-course";
import { CourseCreationApplicationError } from "./creation-errors";
import type {
  CourseCreationEffects,
  CourseCreationRepository,
} from "./creation-ports";

function makeRepository() {
  const state = {
    courses: [] as string[],
    effects: [] as CourseCreationEffects[],
  };
  const repository: CourseCreationRepository = {
    async findCourseForCopy() {
      return null;
    },
    async transact(execute) {
      return execute({
        async createCourse(data) {
          state.courses.push(data.title);
          return { id: `crs-${state.courses.length}`, title: data.title };
        },
        async createModule() {
          return { id: "not-used" };
        },
        async createItem() {
          return { id: "not-used", quizId: null };
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

test("пустой title → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository();
  const create = createCreateCourse({ repository });
  await assert.rejects(
    create({ data: { ...DATA, title: "" }, actor: ACTOR, audit: AUDIT }),
    (error) =>
      error instanceof CourseCreationApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
  assert.equal(state.courses.length, 0);
});

test("пустое description → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository();
  const create = createCreateCourse({ repository });
  await assert.rejects(
    create({ data: { ...DATA, description: "" }, actor: ACTOR, audit: AUDIT }),
    (error) =>
      error instanceof CourseCreationApplicationError &&
      /описание/i.test(error.message),
  );
});

test("happy-path: create + audit courses:create", async () => {
  const { repository, state } = makeRepository();
  const create = createCreateCourse({ repository });
  const result = await create({ data: DATA, actor: ACTOR, audit: AUDIT });
  assert.equal(result.courseId, "crs-1");
  assert.equal(state.effects[0].audit?.action, "courses:create");
});
