import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeleteQuizBuilderQuestion } from "./delete-quiz-builder-question";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

function makeRepository(opts: {
  quiz?: { id: string; courseItemId: string } | null;
  question?: { id: string; type: string; config: string } | null;
}) {
  const state = {
    archived: [] as Array<{ questionId: string; at: Date }>,
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
        async updateQuestion() {},
        async swapQuestionsOrder() {},
        async archiveQuestion(questionId, at) {
          state.archived.push({ questionId, at });
        },
        async archiveQuizItem() {},
        async markCourseContentChangedIfPublished(courseId) {
          state.marked.push(courseId);
        },
      });
    },
  };
  return { repository, state };
}

const NOW = new Date("2026-05-01T10:00:00Z");

test("happy-path: archive + markContent", async () => {
  const { repository, state } = makeRepository({});
  const del = createDeleteQuizBuilderQuestion({ repository });
  await del({
    courseId: "c1",
    quizId: "q1",
    questionId: "qq-1",
    now: NOW,
  });
  assert.deepEqual(state.archived, [{ questionId: "qq-1", at: NOW }]);
  assert.deepEqual(state.marked, ["c1"]);
});

test("вопрос не найден → QUESTION_NOT_FOUND, без мутации", async () => {
  const { repository, state } = makeRepository({ question: null });
  const del = createDeleteQuizBuilderQuestion({ repository });
  await assert.rejects(
    del({ courseId: "c1", quizId: "q1", questionId: "missing", now: NOW }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUESTION_NOT_FOUND",
  );
  assert.equal(state.archived.length, 0);
});

test("quiz не найден → QUIZ_NOT_FOUND", async () => {
  const { repository } = makeRepository({ quiz: null });
  const del = createDeleteQuizBuilderQuestion({ repository });
  await assert.rejects(
    del({ courseId: "c1", quizId: "missing", questionId: "qq-1", now: NOW }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUIZ_NOT_FOUND",
  );
});
