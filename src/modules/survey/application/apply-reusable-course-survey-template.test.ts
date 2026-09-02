import assert from "node:assert/strict";
import { test } from "node:test";
import { SurveyApplicationError } from "./errors";
import { createApplyReusableCourseSurveyTemplate } from "./apply-reusable-course-survey-template";
import type {
  ReusableTemplateSnapshot,
  SurveyEffects,
  SurveyTemplateRepository,
} from "./survey-template-ports";

function makeRepository(opts: {
  reusable?: ReusableTemplateSnapshot | null;
  existing?: { id: string; existingQuestionIds: string[] } | null;
}) {
  const state = {
    replaceCourseCalls: [] as Array<{ templateId: string; count: number }>,
    upsertCalls: [] as Array<{ existingId: string | null }>,
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
          state.upsertCalls.push({ existingId: input.existingId });
          return { id: input.existingId ?? "new-template" };
        },
        async syncCourseQuestions() {},
        async replaceCourseQuestions(templateId, questions) {
          state.replaceCourseCalls.push({ templateId, count: questions.length });
        },
        async updateCourseItem() {},
        async upsertItemTemplate() {
          return { id: "not-used" };
        },
        async syncItemQuestions() {},
        async replaceItemQuestions() {},
        async createReusableTemplate() {
          return { id: "not-used" };
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

const REUSABLE: ReusableTemplateSnapshot = {
  id: "r-1",
  title: "Шаблон",
  description: null,
  introImageUrl: null,
  isRequired: false,
  questions: [
    { title: "q1", type: "TEXT", optionsJson: null, isRequired: true },
    { title: "q2", type: "RATING_5", optionsJson: null, isRequired: true },
  ],
};

test("пустой reusableTemplateId → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({});
  const apply = createApplyReusableCourseSurveyTemplate({ repository });

  await assert.rejects(
    apply({
      courseId: "c1",
      reusableTemplateId: "",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
});

test("reusable не найден → REUSABLE_NOT_FOUND", async () => {
  const { repository } = makeRepository({ reusable: null });
  const apply = createApplyReusableCourseSurveyTemplate({ repository });

  await assert.rejects(
    apply({
      courseId: "c1",
      reusableTemplateId: "r-missing",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "REUSABLE_NOT_FOUND",
  );
});

test("reusable без вопросов → REUSABLE_NOT_FOUND", async () => {
  const { repository } = makeRepository({
    reusable: { ...REUSABLE, questions: [] },
  });
  const apply = createApplyReusableCourseSurveyTemplate({ repository });

  await assert.rejects(
    apply({
      courseId: "c1",
      reusableTemplateId: "r-1",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "REUSABLE_NOT_FOUND",
  );
});

test("happy-path: replaceCourseQuestions с количеством вопросов из reusable + audit apply", async () => {
  const { repository, state } = makeRepository({ reusable: REUSABLE });
  const apply = createApplyReusableCourseSurveyTemplate({ repository });

  const result = await apply({
    courseId: "c1",
    reusableTemplateId: "r-1",
    actor: ACTOR,
    audit: AUDIT,
  });

  assert.equal(result.reusableTitle, "Шаблон");
  assert.equal(state.replaceCourseCalls[0].count, 2);
  assert.equal(state.effects[0].audits?.[0].action, "course_survey_template:apply");
});
