import assert from "node:assert/strict";
import { test } from "node:test";
import { createUpdateQuizBuilderQuestion } from "./update-quiz-builder-question";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

function makeRepository(opts: {
  quiz?: { id: string; courseItemId: string } | null;
  question?: { id: string; type: string; config: string } | null;
}) {
  const state = {
    updates: [] as Array<{ questionId: string; type: string }>,
    marked: [] as string[],
  };
  const repository: QuizBuilderRepository = {
    async findQuiz() {
      return opts.quiz === undefined
        ? { id: "q1", courseItemId: "ci1" }
        : opts.quiz;
    },
    async findQuestion() {
      return opts.question === undefined
        ? { id: "qq-1", type: "SINGLE_CHOICE", config: "{}" }
        : opts.question;
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
        async updateSettings() {},
        async createQuestion() {
          return { id: "not-used" };
        },
        async createQuestionBatch() {
          return [];
        },
        async updateQuestion(input) {
          state.updates.push({ questionId: input.questionId, type: input.data.type });
        },
        async swapQuestionsOrder() {},
        async archiveQuestion() {},
        async archiveQuizItem() {},
        async markCourseContentChangedIfPublished(courseId) {
          state.marked.push(courseId);
        },
      });
    },
  };
  return { repository, state };
}

test("тип не совпадает с существующим → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository({});
  const update = createUpdateQuizBuilderQuestion({ repository });
  await assert.rejects(
    update({
      courseId: "c1",
      quizId: "q1",
      questionId: "qq-1",
      data: { type: "OPEN", prompt: "Q", points: 1, config: "{}" },
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      /тип/i.test(error.message),
  );
  assert.equal(state.updates.length, 0);
});

test("question не найден → QUESTION_NOT_FOUND", async () => {
  const { repository } = makeRepository({ question: null });
  const update = createUpdateQuizBuilderQuestion({ repository });
  await assert.rejects(
    update({
      courseId: "c1",
      quizId: "q1",
      questionId: "missing",
      data: { type: "SINGLE_CHOICE", prompt: "Q", points: 1, config: "{}" },
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUESTION_NOT_FOUND",
  );
});

test("happy-path: тот же тип → update + markContent", async () => {
  const { repository, state } = makeRepository({});
  const update = createUpdateQuizBuilderQuestion({ repository });
  await update({
    courseId: "c1",
    quizId: "q1",
    questionId: "qq-1",
    data: { type: "SINGLE_CHOICE", prompt: "New Q", points: 2, config: "{}" },
  });
  assert.deepEqual(state.updates, [{ questionId: "qq-1", type: "SINGLE_CHOICE" }]);
  assert.deepEqual(state.marked, ["c1"]);
});
