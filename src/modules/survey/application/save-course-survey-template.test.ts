import assert from "node:assert/strict";
import { test } from "node:test";
import { SurveyApplicationError } from "./errors";
import { createSaveCourseSurveyTemplate } from "./save-course-survey-template";
import type {
  CourseTemplateSnapshot,
  ReusableTemplateSnapshot,
  SurveyEffects,
  SurveyQuestionsSyncArgs,
  SurveyTemplateRepository,
} from "./survey-template-ports";

// Use-case сохранения template опроса КУРСА. Проверяем через фейковый порт:
// валидации (busy image / empty questions), новый vs существующий (аудит-код),
// опционально reusable → два аудита.

function makeRepository(opts: {
  existing?: CourseTemplateSnapshot | null;
  reusable?: ReusableTemplateSnapshot | null;
}) {
  const state = {
    upsertCourseTemplateCalls: [] as Array<{ existingId: string | null }>,
    syncCourseQuestionsCalls: [] as SurveyQuestionsSyncArgs[],
    replaceCourseQuestionsCalls: [] as Array<{ templateId: string; count: number }>,
    reusableCreated: [] as string[],
    effects: [] as SurveyEffects[],
  };

  const repository: SurveyTemplateRepository = {
    async findCourseTemplate() {
      return opts.existing ?? null;
    },
    async findItem() {
      return null;
    },
    async findItemTemplate() {
      return null;
    },
    async findReusableTemplate() {
      return opts.reusable ?? null;
    },
    async transact(execute) {
      return execute({
        async upsertCourseTemplate(input) {
          state.upsertCourseTemplateCalls.push({ existingId: input.existingId });
          return { id: input.existingId ?? "new-course-template-id" };
        },
        async syncCourseQuestions(args) {
          state.syncCourseQuestionsCalls.push(args);
        },
        async replaceCourseQuestions(templateId, questions) {
          state.replaceCourseQuestionsCalls.push({
            templateId,
            count: questions.length,
          });
        },
        async updateCourseItem() {},
        async upsertItemTemplate() {
          return { id: "not-used" };
        },
        async syncItemQuestions() {},
        async replaceItemQuestions() {},
        async createReusableTemplate(input) {
          const id = `reusable-${state.reusableCreated.length + 1}`;
          state.reusableCreated.push(id);
          void input;
          return { id };
        },
        async markCourseContentChangedIfPublished() {},
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

test("нет вопросов → VALIDATION_FAILED, без обращения к транзакции", async () => {
  const { repository, state } = makeRepository({});
  const save = createSaveCourseSurveyTemplate({ repository });

  await assert.rejects(
    save({
      courseId: "c1",
      actor: ACTOR,
      audit: AUDIT,
      title: "T",
      description: null,
      introImageUrl: null,
      introImageUploadBusy: false,
      isActive: true,
      isRequired: false,
      saveAsReusableTemplate: false,
      questions: [],
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
  assert.equal(state.upsertCourseTemplateCalls.length, 0);
});

test("introImageUploadBusy → INTRO_IMAGE_BUSY", async () => {
  const { repository } = makeRepository({});
  const save = createSaveCourseSurveyTemplate({ repository });

  await assert.rejects(
    save({
      courseId: "c1",
      actor: ACTOR,
      audit: AUDIT,
      title: "T",
      description: null,
      introImageUrl: null,
      introImageUploadBusy: true,
      isActive: true,
      isRequired: false,
      saveAsReusableTemplate: false,
      questions: [QUESTION],
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "INTRO_IMAGE_BUSY",
  );
});

test("новый template + reusable=true → два аудита; аудит create", async () => {
  const { repository, state } = makeRepository({ existing: null });
  const save = createSaveCourseSurveyTemplate({ repository });

  const result = await save({
    courseId: "c1",
    actor: ACTOR,
    audit: AUDIT,
    title: "T",
    description: null,
    introImageUrl: "/img.webp",
    introImageUploadBusy: false,
    isActive: true,
    isRequired: false,
    saveAsReusableTemplate: true,
    questions: [QUESTION],
  });

  assert.equal(result.isCreate, true);
  assert.equal(result.reusableTemplateId, "reusable-1");
  assert.equal(state.effects.length, 1);
  const audits = state.effects[0].audits ?? [];
  assert.equal(audits.length, 2);
  assert.equal(audits[0].action, "course_survey:create");
  assert.equal(audits[1].action, "course_survey_template:create");
});

test("существующий template без reusable → один аудит update", async () => {
  const { repository, state } = makeRepository({
    existing: { id: "t-existing", existingQuestionIds: ["q-old"] },
  });
  const save = createSaveCourseSurveyTemplate({ repository });

  const result = await save({
    courseId: "c1",
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
  });

  assert.equal(result.isCreate, false);
  assert.equal(result.reusableTemplateId, null);
  const audits = state.effects[0].audits ?? [];
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "course_survey:update");
  // Существующий вопрос без id в incoming → пойдёт на delete.
  assert.deepEqual(state.syncCourseQuestionsCalls[0].toDeleteIds, ["q-old"]);
});
