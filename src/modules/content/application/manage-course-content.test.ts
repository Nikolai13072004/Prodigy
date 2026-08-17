import assert from "node:assert/strict";
import test from "node:test";
import { ContentApplicationError } from "./errors";
import { createManageCourseContent } from "./manage-course-content";
import type {
  ContentRepository,
  ContentTransaction,
  CreateContentItemData,
} from "./ports";

function createFixture(overrides: Partial<ContentTransaction> = {}) {
  const calls = {
    transactions: 0,
    createdModules: [] as Array<{ courseId: string; title: string; description: string | null; orderIndex: number }>,
    createdItems: [] as CreateContentItemData[],
    archivedModules: [] as string[],
    markedCourses: [] as string[],
    orderUpdates: [] as Array<Array<{ id: string; orderIndex: number }>>,
    createdQuestions: [] as Array<{ quizId: string; orderIndex: number; type: string; prompt: string; config: string; points: number }>,
  };
  const transaction: ContentTransaction = {
    async findActiveModule() { return { id: "module-1" }; },
    async findFirstActiveModule() { return { id: "module-1" }; },
    async nextModuleOrderIndex() { return 2; },
    async nextItemOrderIndex() { return 5; },
    async createModule(args) {
      calls.createdModules.push(args);
      return { id: `module-${calls.createdModules.length + 1}` };
    },
    async updateModule() {},
    async archiveModule(_courseId, moduleId) { calls.archivedModules.push(moduleId); },
    async createItem(data) {
      calls.createdItems.push(data);
      return { id: "item-new" };
    },
    async findActiveItem() { return { id: "item-1", type: "TEXT" }; },
    async updateItem() {},
    async archiveItem() { return true; },
    async loadOrdering() {
      return {
        moduleIds: ["module-1"],
        items: [
          { id: "item-1", moduleId: "module-1" },
          { id: "item-2", moduleId: "module-1" },
        ],
      };
    },
    async updateItemOrder(items) { calls.orderUpdates.push(items); },
    async markContentChanged(courseId) { calls.markedCourses.push(courseId); },
    async findQuiz() { return { id: "quiz-1" }; },
    async updateQuizSettings() {},
    async nextQuestionOrderIndex() { return 3; },
    async createQuestion(args) { calls.createdQuestions.push(args); },
    async archiveQuestion() { return true; },
    ...overrides,
  };
  const repository: ContentRepository = {
    async transact(execute) {
      calls.transactions += 1;
      return execute(transaction);
    },
  };
  return { service: createManageCourseContent(repository), calls };
}

test("creates a module and marks published content in one transaction", async () => {
  const fixture = createFixture();
  await fixture.service.createModule({ courseId: "course-1", title: "  Intro  ", description: null });
  assert.equal(fixture.calls.transactions, 1);
  assert.deepEqual(fixture.calls.createdModules, [{
    courseId: "course-1",
    title: "Intro",
    description: null,
    orderIndex: 2,
  }]);
  assert.deepEqual(fixture.calls.markedCourses, ["course-1"]);
});

test("creates the default module atomically for the first course item", async () => {
  const fixture = createFixture({ async findFirstActiveModule() { return null; } });
  const created = await fixture.service.createItem({
    courseId: "course-1",
    moduleId: null,
    type: "VIDEO",
    title: "Video",
    content: null,
    contentIsMeaningful: false,
    fileUrl: "/uploads/video.mp4",
    totalSlides: null,
    presentationViewMode: "PDF_PREVIEW",
    isRequired: true,
    maxAttempts: 1,
    minCorrectAnswers: 1,
    survey: null,
  });
  assert.equal(created.id, "item-new");
  assert.equal(fixture.calls.createdModules[0].title, "Материалы курса");
  assert.equal(fixture.calls.createdItems[0].moduleId, "module-2");
  assert.equal(fixture.calls.createdItems[0].orderIndex, 5);
  assert.deepEqual(fixture.calls.markedCourses, ["course-1"]);
});

test("rejects a module that does not belong to the course before writing", async () => {
  const fixture = createFixture({ async findActiveModule() { return null; } });
  await assert.rejects(
    fixture.service.createItem({
      courseId: "course-1",
      moduleId: "foreign-module",
      type: "PDF",
      title: "Slides",
      content: null,
      contentIsMeaningful: false,
      fileUrl: "/uploads/slides.pdf",
      totalSlides: 4,
      presentationViewMode: "PDF_PREVIEW",
      isRequired: true,
      maxAttempts: 1,
      minCorrectAnswers: 1,
      survey: null,
    }),
    (error: unknown) => error instanceof ContentApplicationError && error.code === "MODULE_NOT_FOUND",
  );
  assert.equal(fixture.calls.createdItems.length, 0);
  assert.equal(fixture.calls.markedCourses.length, 0);
});

test("module deletion archives its content and marks the course in one transaction", async () => {
  const fixture = createFixture();
  await fixture.service.deleteModule({
    courseId: "course-1",
    moduleId: "module-1",
    now: new Date("2026-08-13T12:00:00Z"),
  });
  assert.equal(fixture.calls.transactions, 1);
  assert.deepEqual(fixture.calls.archivedModules, ["module-1"]);
  assert.deepEqual(fixture.calls.markedCourses, ["course-1"]);
});

test("moving an item persists the domain order inside the transaction", async () => {
  const fixture = createFixture();
  await fixture.service.moveItem({ courseId: "course-1", itemId: "item-2", direction: "up" });
  assert.deepEqual(fixture.calls.orderUpdates[0], [
    { id: "item-2", orderIndex: 0 },
    { id: "item-1", orderIndex: 1 },
  ]);
  assert.deepEqual(fixture.calls.markedCourses, ["course-1"]);
});

test("creates a quiz question and draft marker atomically", async () => {
  const fixture = createFixture();
  await fixture.service.createQuestion({
    courseId: "course-1",
    quizId: "quiz-1",
    type: "OPEN",
    prompt: " Question ",
    config: '{"sampleAnswer":"Answer"}',
    points: 2,
  });
  assert.equal(fixture.calls.transactions, 1);
  assert.deepEqual(fixture.calls.createdQuestions, [{
    quizId: "quiz-1",
    orderIndex: 3,
    type: "OPEN",
    prompt: "Question",
    config: '{"sampleAnswer":"Answer"}',
    points: 2,
  }]);
  assert.deepEqual(fixture.calls.markedCourses, ["course-1"]);
});

test("rejects a quiz from another course before changing settings", async () => {
  let writes = 0;
  const fixture = createFixture({
    async findQuiz() { return null; },
    async updateQuizSettings() { writes += 1; },
  });
  await assert.rejects(fixture.service.updateQuizSettings({
    courseId: "course-1",
    quizId: "foreign-quiz",
    maxAttempts: 1,
    minCorrectAnswers: 1,
    timeLimitMinutes: null,
    shuffleQuestions: false,
    shuffleAnswers: false,
    lockMaterialsOnStart: true,
  }), ContentApplicationError);
  assert.equal(writes, 0);
  assert.deepEqual(fixture.calls.markedCourses, []);
});
