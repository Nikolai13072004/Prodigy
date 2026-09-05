import assert from "node:assert/strict";
import { test } from "node:test";
import { createSaveQuizBuilderSettings } from "./save-quiz-builder-settings";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

const SETTINGS = {
  title: "Тест",
  description: null,
  maxAttempts: 3,
  minCorrectAnswers: 2,
  timeLimitMinutes: 60,
  questionPoolSize: null,
  retryDelayMinutes: null,
  shuffleQuestions: false,
  shuffleAnswers: false,
  lockMaterialsOnStart: true,
  trackSecurityEvents: false,
  resultViewMode: "SCORE_ONLY",
};

function makeRepository(opts: {
  quiz?: { id: string; courseItemId: string } | null;
}) {
  const state = {
    updates: 0,
    markedContent: [] as string[],
  };
  const repository: QuizBuilderRepository = {
    async findQuiz() {
      return opts.quiz === undefined
        ? { id: "q1", courseItemId: "ci1" }
        : opts.quiz;
    },
    async findQuestion() {
      return null;
    },
    async findExistingPrompts() {
      return new Set();
    },
    async getQuestionsOrder() {
      return [];
    },
    async nextOrderIndex() {
      return 0;
    },
    async transact(execute) {
      return execute({
        async updateSettings() {
          state.updates += 1;
        },
        async createQuestion() {
          return { id: "not-used" };
        },
        async createQuestionBatch() {
          return [];
        },
        async updateQuestion() {},
        async swapQuestionsOrder() {},
        async archiveQuestion() {},
        async archiveQuizItem() {},
        async markCourseContentChangedIfPublished(courseId) {
          state.markedContent.push(courseId);
        },
      });
    },
  };
  return { repository, state };
}

test("пустой title → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository({});
  const save = createSaveQuizBuilderSettings({ repository });
  await assert.rejects(
    save({
      courseId: "c1",
      quizId: "q1",
      settings: { ...SETTINGS, title: "" },
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
  assert.equal(state.updates, 0);
});

test("неизвестный resultViewMode → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({});
  const save = createSaveQuizBuilderSettings({ repository });
  await assert.rejects(
    save({
      courseId: "c1",
      quizId: "q1",
      settings: { ...SETTINGS, resultViewMode: "INVALID" },
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      /режим показа/i.test(error.message),
  );
});

test("quiz не найден → QUIZ_NOT_FOUND", async () => {
  const { repository } = makeRepository({ quiz: null });
  const save = createSaveQuizBuilderSettings({ repository });
  await assert.rejects(
    save({ courseId: "c1", quizId: "missing", settings: SETTINGS }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUIZ_NOT_FOUND",
  );
});

test("happy-path: updateSettings + markContent", async () => {
  const { repository, state } = makeRepository({});
  const save = createSaveQuizBuilderSettings({ repository });
  await save({ courseId: "c1", quizId: "q1", settings: SETTINGS });
  assert.equal(state.updates, 1);
  assert.deepEqual(state.markedContent, ["c1"]);
});
