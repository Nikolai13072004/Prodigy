import assert from "node:assert/strict";
import { test } from "node:test";
import { createImportQuizBuilderQuestions } from "./import-quiz-builder-questions";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

function makeRepository(opts: {
  quiz?: { id: string; courseItemId: string } | null;
  existingPrompts?: string[];
  nextIndex?: number;
}) {
  const state = {
    batches: [] as Array<{ startOrderIndex: number; count: number }>,
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
      return new Set(opts.existingPrompts ?? []);
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
        async createQuestion() {
          return { id: "not-used" };
        },
        async createQuestionBatch(input) {
          state.batches.push({
            startOrderIndex: input.startOrderIndex,
            count: input.items.length,
          });
          return input.items.map((_, i) => ({ id: `imp-${i + 1}` }));
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

function question(prompt: string) {
  return {
    type: "SINGLE_CHOICE" as const,
    prompt,
    points: 1,
    config: JSON.stringify({ options: ["a", "b"], correctIndex: 0 }),
  };
}

test("пустой массив → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository({});
  const importQ = createImportQuizBuilderQuestions({ repository });
  await assert.rejects(
    importQ({ courseId: "c1", quizId: "q1", questions: [] }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
  assert.equal(state.batches.length, 0);
});

test("все вопросы — дубликаты → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({ existingPrompts: ["A", "B"] });
  const importQ = createImportQuizBuilderQuestions({ repository });
  await assert.rejects(
    importQ({
      courseId: "c1",
      quizId: "q1",
      questions: [question("A"), question("B")],
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      /уже есть в тесте/i.test(error.message),
  );
});

test("dedup: удаляет дубликаты (в т.ч. внутри-batch)", async () => {
  const { repository, state } = makeRepository({
    existingPrompts: ["A"],
    nextIndex: 3,
  });
  const importQ = createImportQuizBuilderQuestions({ repository });
  const result = await importQ({
    courseId: "c1",
    quizId: "q1",
    questions: [question("A"), question("B"), question("B"), question("C")],
  });
  assert.equal(result.totalParsed, 4);
  assert.equal(result.createdCount, 2, "B и C — дубликат B и A пропущены");
  assert.equal(result.duplicatesSkipped, 2);
  assert.equal(result.firstCreatedQuestionId, "imp-1");
  assert.deepEqual(state.batches, [{ startOrderIndex: 3, count: 2 }]);
  assert.deepEqual(state.marked, ["c1"]);
});

test("quiz не найден → QUIZ_NOT_FOUND", async () => {
  const { repository } = makeRepository({ quiz: null });
  const importQ = createImportQuizBuilderQuestions({ repository });
  await assert.rejects(
    importQ({
      courseId: "c1",
      quizId: "missing",
      questions: [question("A")],
    }),
    (error) =>
      error instanceof QuizBuilderApplicationError &&
      error.code === "QUIZ_NOT_FOUND",
  );
});
