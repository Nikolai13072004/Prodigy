import assert from "node:assert/strict";
import { test } from "node:test";
import { createCopyCourse } from "./copy-course";
import { CourseCreationApplicationError } from "./creation-errors";
import type {
  CourseCopySnapshot,
  CourseCreationEffects,
  CourseCreationRepository,
  CreateCourseItemInput,
} from "./creation-ports";

function makeSnapshot(overrides: Partial<CourseCopySnapshot> = {}): CourseCopySnapshot {
  return {
    id: "src-1",
    title: "Исходный",
    description: "Src desc",
    requirements: null,
    targetAudience: null,
    category: null,
    difficultyLevel: null,
    durationMinutes: null,
    tagsJson: null,
    thumbnailUrl: null,
    coverUrl: null,
    navigationMode: "FREE",
    quizGateMode: "RESOLVED",
    completionMode: "AUTO",
    statusFormat: "DEFAULT",
    gradedItemIdsJson: null,
    resultViewMode: "SCORE_ONLY",
    modules: [
      { id: "src-m-1", title: "M1", description: null, orderIndex: 0 },
    ],
    items: [
      {
        id: "src-i-1",
        moduleId: "src-m-1",
        orderIndex: 0,
        type: "PDF",
        title: "Item1",
        content: null,
        fileUrl: "/u.pdf",
        totalSlides: 3,
        presentationViewMode: "PDF_PREVIEW",
        isRequired: true,
        quiz: null,
      },
    ],
    ...overrides,
  };
}

function makeRepository(opts: { source?: CourseCopySnapshot | null }) {
  const state = {
    coursesCreated: 0,
    modulesCreated: [] as string[],
    itemsCreated: [] as CreateCourseItemInput[],
    effects: [] as CourseCreationEffects[],
  };
  const repository: CourseCreationRepository = {
    async findCourseForCopy() {
      return opts.source === undefined ? makeSnapshot() : opts.source;
    },
    async transact(execute) {
      return execute({
        async createCourse(data) {
          state.coursesCreated += 1;
          return { id: `new-${state.coursesCreated}`, title: data.title };
        },
        async createModule(data) {
          state.modulesCreated.push(data.title);
          return { id: `new-m-${state.modulesCreated.length}` };
        },
        async createItem(data) {
          state.itemsCreated.push(data);
          return { id: `new-i-${state.itemsCreated.length}`, quizId: null };
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

test("sourceCourseId пуст → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({});
  const copy = createCopyCourse({ repository });
  await assert.rejects(
    copy({
      sourceCourseId: "",
      ownerId: "u1",
      titleOverride: null,
      descriptionOverride: null,
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof CourseCreationApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
});

test("источник не найден → SOURCE_NOT_FOUND", async () => {
  const { repository } = makeRepository({ source: null });
  const copy = createCopyCourse({ repository });
  await assert.rejects(
    copy({
      sourceCourseId: "missing",
      ownerId: "u1",
      titleOverride: null,
      descriptionOverride: null,
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof CourseCreationApplicationError &&
      error.code === "SOURCE_NOT_FOUND",
  );
});

test("без title override: подставляется '<исходный> — копия'", async () => {
  const { repository, state } = makeRepository({});
  const copy = createCopyCourse({ repository });
  const result = await copy({
    sourceCourseId: "src-1",
    ownerId: "u2",
    titleOverride: null,
    descriptionOverride: null,
    actor: ACTOR,
    audit: AUDIT,
  });
  assert.equal(result.title, "Исходный — копия");
  assert.equal(result.sourceTitle, "Исходный");
  assert.equal(state.modulesCreated.length, 1);
  assert.equal(state.itemsCreated.length, 1);
  assert.equal(state.itemsCreated[0].fileUrl, "/u.pdf");
  assert.equal(state.effects[0].audit?.action, "courses:copy");
});

test("моды → маппинг moduleId в новом курсе", async () => {
  const { repository, state } = makeRepository({});
  const copy = createCopyCourse({ repository });
  await copy({
    sourceCourseId: "src-1",
    ownerId: "u2",
    titleOverride: "New Title",
    descriptionOverride: null,
    actor: ACTOR,
    audit: AUDIT,
  });
  assert.equal(state.itemsCreated[0].moduleId, "new-m-1", "item ссылается на созданный модуль, а не на src-m-1");
});
