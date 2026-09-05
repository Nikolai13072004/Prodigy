import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeleteQuizFromBuilder } from "./delete-quiz-from-builder";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

function makeRepository(opts: {
  quiz?: { id: string; courseItemId: string } | null;
}) {
  const state = {
    archived: [] as Array<{ courseItemId: string; at: Date }>,
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
        async swapQuestionsOrder() {},
        async archiveQuestion() {},
        async archiveQuizItem(courseItemId, at) {
          state.archived.push({ courseItemId, at });
        },
        async markCourseContentChangedIfPublished(courseId) {
          state.marked.push(courseId);
        },
      });
    },
  };
  return { repository, state };
}

const NOW = new Date("2026-05-01T10:00:00Z");

test("happy-path: archive item + markContent", async () => {
  const { repository, state } = makeRepository({});
  const del = createDeleteQuizFromBuilder({ repository });
  await del({ courseId: "c1", quizId: "q1", now: NOW });
  assert.deepEqual(state.archived, [{ courseItemId: "ci1", at: NOW }]);
  assert.deepEqual(state.marked, ["c1"]);
});

test("quiz не найден → QUIZ_NOT_FOUND", async () => {
  const { repository, state } = makeRepository({ quiz: null });
  const del = createDeleteQuizFromBuilder({ repository });
  await assert.rejects(
    del({ courseId: "c1", quizId: "missing", now: NOW }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUIZ_NOT_FOUND",
  );
  assert.equal(state.archived.length, 0);
});
