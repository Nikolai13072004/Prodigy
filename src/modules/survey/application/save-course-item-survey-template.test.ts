import assert from "node:assert/strict";
import { test } from "node:test";
import { SurveyApplicationError } from "./errors";
import { createSaveCourseItemSurveyTemplate } from "./save-course-item-survey-template";
import type {
  CourseItemSnapshot,
  CourseItemTemplateSnapshot,
  SurveyEffects,
  SurveyTemplateRepository,
} from "./survey-template-ports";

// Use-case сохранения item-level template. Проверяем ITEM_NOT_SURVEY,
// вызов updateCourseItem + markCourseContentChangedIfPublished в транзакции.

function makeRepository(opts: {
  item?: CourseItemSnapshot | null;
  existing?: CourseItemTemplateSnapshot | null;
}) {
  const state = {
    updatedItem: [] as Array<{ itemId: string; title: string; isRequired: boolean }>,
    upsertItemTemplate: [] as Array<{ existingId: string | null }>,
    syncItemQuestions: 0,
    reusableCreated: 0,
    markedContentChanged: [] as string[],
    effects: [] as SurveyEffects[],
  };

  const repository: SurveyTemplateRepository = {
    async findCourseTemplate() {
      return null;
    },
    async findItem() {
      return opts.item ?? null;
    },
    async findItemTemplate() {
      return opts.existing ?? null;
    },
    async findReusableTemplate() {
      return null;
    },
    async transact(execute) {
      return execute({
        async upsertCourseTemplate() {
          return { id: "not-used" };
        },
        async syncCourseQuestions() {},
        async replaceCourseQuestions() {},
        async updateCourseItem(itemId, fields) {
          state.updatedItem.push({ itemId, ...fields });
        },
        async upsertItemTemplate(input) {
          state.upsertItemTemplate.push({ existingId: input.existingId });
          return { id: input.existingId ?? "new-item-template" };
        },
        async syncItemQuestions() {
          state.syncItemQuestions += 1;
        },
        async replaceItemQuestions() {},
        async createReusableTemplate() {
          state.reusableCreated += 1;
          return { id: `reusable-${state.reusableCreated}` };
        },
        async markCourseContentChangedIfPublished(courseId) {
          state.markedContentChanged.push(courseId);
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      });
    },
  };

  return { repository, state };
}

const ACTOR = { id: "admin-1", login: null, name: null };
const AUDIT = { ipAddress: null, userAgent: null };
const QUESTION = {
  id: null,
  title: "Q",
  type: "TEXT",
  optionsJson: null,
  isRequired: true,
};

test("item не SURVEY → ITEM_NOT_SURVEY, транзакция не открывается", async () => {
  const { repository, state } = makeRepository({
    item: { id: "i1", type: "TEXT" },
  });
  const save = createSaveCourseItemSurveyTemplate({ repository });

  await assert.rejects(
    save({
      courseId: "c1",
      itemId: "i1",
      actor: ACTOR,
      audit: AUDIT,
      title: "T",
      description: null,
      introImageUrl: null,
      introImageUploadBusy: false,
      isActive: true,
      isRequired: false,
      saveAsReusableTemplate: false,
      questions: [QUESTION],
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "ITEM_NOT_SURVEY",
  );
  assert.equal(state.updatedItem.length, 0);
  assert.equal(state.effects.length, 0);
});

test("item отсутствует → ITEM_NOT_SURVEY", async () => {
  const { repository } = makeRepository({ item: null });
  const save = createSaveCourseItemSurveyTemplate({ repository });

  await assert.rejects(
    save({
      courseId: "c1",
      itemId: "missing",
      actor: ACTOR,
      audit: AUDIT,
      title: "T",
      description: null,
      introImageUrl: null,
      introImageUploadBusy: false,
      isActive: true,
      isRequired: false,
      saveAsReusableTemplate: false,
      questions: [QUESTION],
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "ITEM_NOT_SURVEY",
  );
});

test("happy-path: updateCourseItem + markContentChanged + audit create", async () => {
  const { repository, state } = makeRepository({
    item: { id: "i1", type: "SURVEY" },
    existing: null,
  });
  const save = createSaveCourseItemSurveyTemplate({ repository });

  const result = await save({
    courseId: "c1",
    itemId: "i1",
    actor: ACTOR,
    audit: AUDIT,
    title: "T",
    description: null,
    introImageUrl: null,
    introImageUploadBusy: false,
    isActive: true,
    isRequired: true,
    saveAsReusableTemplate: false,
    questions: [QUESTION],
  });

  assert.equal(result.isCreate, true);
  assert.equal(state.updatedItem.length, 1);
  assert.equal(state.updatedItem[0].isRequired, true);
  assert.deepEqual(state.markedContentChanged, ["c1"]);
  const audits = state.effects[0].audits ?? [];
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "course_item_survey:create");
});
