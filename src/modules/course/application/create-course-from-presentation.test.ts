import assert from "node:assert/strict";
import { test } from "node:test";
import { createCreateCourseFromPresentation } from "./create-course-from-presentation";
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
    nextQuizId: "quiz-1",
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
          return {
            id: `i-${state.items.length}`,
            quizId: data.quiz ? state.nextQuizId : null,
          };
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

function baseCommand() {
  return {
    data: DATA,
    moduleTitle: "Материалы",
    presentationTitle: "Презентация",
    fileUrl: "/uploads/a.pdf",
    totalSlides: 5,
    presentationViewMode: "PDF_PREVIEW",
    includeQuiz: false,
    actor: ACTOR,
    audit: AUDIT,
  };
}

test("без fileUrl → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository();
  const create = createCreateCourseFromPresentation({ repository });
  await assert.rejects(
    create({ ...baseCommand(), fileUrl: "" }),
    (error) =>
      error instanceof CourseCreationApplicationError &&
      /файл презентации/i.test(error.message),
  );
  assert.equal(state.items.length, 0);
});

test("totalSlides < 1 → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository();
  const create = createCreateCourseFromPresentation({ repository });
  await assert.rejects(
    create({ ...baseCommand(), totalSlides: 0 }),
    (error) =>
      error instanceof CourseCreationApplicationError &&
      /слайдов/i.test(error.message),
  );
});

test("без includeQuiz: 1 module + 1 PDF item, quizId=null", async () => {
  const { repository, state } = makeRepository();
  const create = createCreateCourseFromPresentation({ repository });
  const result = await create(baseCommand());
  assert.equal(state.modules.length, 1);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].type, "PDF");
  assert.equal(result.quizId, null);
  assert.equal(state.effects[0].audit?.action, "courses:create_from_presentation");
});

test("includeQuiz=true: PDF item + QUIZ item, quizId возвращается", async () => {
  const { repository, state } = makeRepository();
  const create = createCreateCourseFromPresentation({ repository });
  const result = await create({ ...baseCommand(), includeQuiz: true });
  assert.equal(state.items.length, 2);
  assert.equal(state.items[1].type, "QUIZ");
  assert.equal(state.items[1].quiz?.maxAttempts, 2);
  assert.equal(result.quizId, "quiz-1");
});
