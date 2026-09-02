import assert from "node:assert/strict";
import { test } from "node:test";
import { createMoveQuizBuilderQuestion } from "./move-quiz-builder-question";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

function makeRepository(opts: {
  quiz?: { id: string; courseItemId: string } | null;
  questions?: Array<{ id: string; orderIndex: number }>;
}) {
  const state = {
    swaps: [] as Array<{ a: string; ai: number; b: string; bi: number }>,
    marked: [] as string[],
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
      return (
        opts.questions ?? [
          { id: "qq-1", orderIndex: 0 },
          { id: "qq-2", orderIndex: 1 },
          { id: "qq-3", orderIndex: 2 },
        ]
      );
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
        async updateQuestion() {},
        async swapQuestionsOrder(a, ai, b, bi) {
          state.swaps.push({ a, ai, b, bi });
        },
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

test("UP из середины: обмен с предыдущим", async () => {
  const { repository, state } = makeRepository({});
  const move = createMoveQuizBuilderQuestion({ repository });
  const result = await move({
    courseId: "c1",
    quizId: "q1",
    questionId: "qq-2",
    direction: "UP",
  });
  assert.equal(result.moved, true);
  assert.deepEqual(state.swaps, [{ a: "qq-2", ai: 1, b: "qq-1", bi: 0 }]);
  assert.deepEqual(state.marked, ["c1"]);
});

test("UP с начала: moved=false, без swap и markContent", async () => {
  const { repository, state } = makeRepository({});
  const move = createMoveQuizBuilderQuestion({ repository });
  const result = await move({
    courseId: "c1",
    quizId: "q1",
    questionId: "qq-1",
    direction: "UP",
  });
  assert.equal(result.moved, false);
  assert.equal(state.swaps.length, 0);
  assert.equal(state.marked.length, 0);
});

test("DOWN с конца: moved=false", async () => {
  const { repository } = makeRepository({});
  const move = createMoveQuizBuilderQuestion({ repository });
  const result = await move({
    courseId: "c1",
    quizId: "q1",
    questionId: "qq-3",
    direction: "DOWN",
  });
  assert.equal(result.moved, false);
});

test("вопрос не найден в списке → QUESTION_NOT_FOUND", async () => {
  const { repository } = makeRepository({});
  const move = createMoveQuizBuilderQuestion({ repository });
  await assert.rejects(
    move({
      courseId: "c1",
      quizId: "q1",
      questionId: "missing",
      direction: "UP",
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUESTION_NOT_FOUND",
  );
});

test("quiz не найден → QUIZ_NOT_FOUND", async () => {
  const { repository } = makeRepository({ quiz: null });
  const move = createMoveQuizBuilderQuestion({ repository });
  await assert.rejects(
    move({
      courseId: "c1",
      quizId: "missing",
      questionId: "qq-1",
      direction: "UP",
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUIZ_NOT_FOUND",
  );
});
