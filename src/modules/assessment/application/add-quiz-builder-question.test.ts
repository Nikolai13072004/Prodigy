import assert from "node:assert/strict";
import { test } from "node:test";
import { createAddQuizBuilderQuestion } from "./add-quiz-builder-question";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

function makeRepository(opts: {
  quiz?: { id: string; courseItemId: string } | null;
  nextIndex?: number;
}) {
  const state = {
    creates: [] as Array<{ orderIndex: number; type: string }>,
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
      return [];
    },
    async nextOrderIndex() {
      return opts.nextIndex ?? 0;
    },
    async transact(execute) {
      return execute({
        async updateSettings() {},
        async createQuestion(input) {
          state.creates.push({ orderIndex: input.orderIndex, type: input.data.type });
          return { id: `q-${state.creates.length}` };
        },
        async createQuestionBatch() {
          return [];
        },
        async updateQuestion() {},
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

test("пустой prompt → VALIDATION_FAILED, без вызовов транзакции", async () => {
  const { repository, state } = makeRepository({});
  const add = createAddQuizBuilderQuestion({ repository });
  await assert.rejects(
    add({
      courseId: "c1",
      quizId: "q1",
      data: { type: "SINGLE_CHOICE", prompt: "", points: 1, config: "{}" },
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
  assert.equal(state.creates.length, 0);
});

test("quiz не найден → QUIZ_NOT_FOUND", async () => {
  const { repository } = makeRepository({ quiz: null });
  const add = createAddQuizBuilderQuestion({ repository });
  await assert.rejects(
    add({
      courseId: "c1",
      quizId: "missing",
      data: { type: "OPEN", prompt: "Q", points: 1, config: "{}" },
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUIZ_NOT_FOUND",
  );
});

test("happy-path: create с nextOrderIndex, mark content, вернуть questionId", async () => {
  const { repository, state } = makeRepository({ nextIndex: 5 });
  const add = createAddQuizBuilderQuestion({ repository });
  const result = await add({
    courseId: "c1",
    quizId: "q1",
    data: { type: "MATCHING", prompt: "Q", points: 3, config: "{}" },
  });
  assert.equal(result.questionId, "q-1");
  assert.deepEqual(state.creates, [{ orderIndex: 5, type: "MATCHING" }]);
  assert.deepEqual(state.marked, ["c1"]);
});
