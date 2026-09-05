import assert from "node:assert/strict";
import { test } from "node:test";
import { SurveyApplicationError } from "./errors";
import { createApplyReusableCourseItemSurveyTemplate } from "./apply-reusable-course-item-survey-template";
import type {
  CourseItemSnapshot,
  ReusableTemplateSnapshot,
  SurveyEffects,
  SurveyTemplateRepository,
} from "./survey-template-ports";

function makeRepository(opts: {
  item?: CourseItemSnapshot | null;
  reusable?: ReusableTemplateSnapshot | null;
  existing?: { id: string; existingQuestionIds: string[] } | null;
}) {
  const state = {
    updatedItem: [] as Array<{
      itemId: string;
      title: string;
      isRequired: boolean;
    }>,
    replaceItemCalls: [] as Array<{ templateId: string; count: number }>,
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
      return opts.reusable ?? null;
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
          return { id: input.existingId ?? "new-item-template" };
        },
        async syncItemQuestions() {},
        async replaceItemQuestions(templateId, questions) {
          state.replaceItemCalls.push({ templateId, count: questions.length });
        },
        async createReusableTemplate() {
          return { id: "not-used" };
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

const REUSABLE: ReusableTemplateSnapshot = {
  id: "r-1",
  title: "Шаблон",
  description: null,
  introImageUrl: null,
  isRequired: true,
  questions: [
    { title: "q1", type: "TEXT", optionsJson: null, isRequired: true },
  ],
};

const SURVEY_ITEM: CourseItemSnapshot = { id: "i1", type: "SURVEY" };

test("item не SURVEY → ITEM_NOT_SURVEY", async () => {
  const { repository } = makeRepository({
    item: { id: "i1", type: "QUIZ" },
    reusable: REUSABLE,
  });
  const apply = createApplyReusableCourseItemSurveyTemplate({ repository });

  await assert.rejects(
    apply({
      courseId: "c1",
      itemId: "i1",
      reusableTemplateId: "r-1",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "ITEM_NOT_SURVEY",
  );
});

test("reusable не найден → REUSABLE_NOT_FOUND", async () => {
  const { repository } = makeRepository({
    item: SURVEY_ITEM,
    reusable: null,
  });
  const apply = createApplyReusableCourseItemSurveyTemplate({ repository });

  await assert.rejects(
    apply({
      courseId: "c1",
      itemId: "i1",
      reusableTemplateId: "r-missing",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof SurveyApplicationError &&
      error.code === "REUSABLE_NOT_FOUND",
  );
});

test("happy-path: updateCourseItem + replaceItemQuestions + markContent + audit apply", async () => {
  const { repository, state } = makeRepository({
    item: SURVEY_ITEM,
    reusable: REUSABLE,
  });
  const apply = createApplyReusableCourseItemSurveyTemplate({ repository });

  const result = await apply({
    courseId: "c1",
    itemId: "i1",
    reusableTemplateId: "r-1",
    actor: ACTOR,
    audit: AUDIT,
  });

  assert.equal(result.reusableTitle, "Шаблон");
  assert.equal(state.updatedItem[0].isRequired, true);
  assert.equal(state.replaceItemCalls[0].count, 1);
  assert.deepEqual(state.markedContentChanged, ["c1"]);
  assert.equal(
    state.effects[0].audits?.[0].action,
    "course_survey_template:apply",
  );
});
