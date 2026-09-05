import assert from "node:assert/strict";
import { test } from "node:test";
import { createSubmitCourseItemSurvey } from "./submit-course-item-survey";
import type {
  CourseItemSurveyContext,
  SurveySubmissionRepository,
} from "./survey-submission-ports";

// Use-case сдачи item-опроса. Проверяем ветки статусов + успешную транзакцию.

function makeContext(overrides: Partial<CourseItemSurveyContext> = {}): CourseItemSurveyContext {
  return {
    course: {
      id: "c1",
      title: "Курс",
      status: "PUBLISHED",
      navigationMode: "FREE",
      quizGateMode: "RESOLVED",
      owner: { name: "Owner", email: "owner@corp.ru", firstName: "Own" },
    },
    items: [
      {
        id: "i1",
        moduleId: null,
        orderIndex: 0,
        type: "SURVEY",
        title: "Опрос",
        content: null,
        fileUrl: null,
        totalSlides: null,
        isRequired: false,
        module: null,
        views: [],
        quiz: null,
      },
    ],
    surveyItem: {
      id: "i1",
      title: "Опрос",
      templateId: "t1",
      templateTitle: "Т1",
      templateIsActive: true,
      questions: [
        {
          id: "q1",
          title: "Q1",
          type: "TEXT",
          optionsJson: null,
          isRequired: true,
        },
      ],
    },
    ...overrides,
  };
}

function makeRepository(opts: {
  assigned?: boolean;
  context?: CourseItemSurveyContext | null;
  learnerName?: string;
  hasResponse?: boolean;
}) {
  const state = {
    itemResponses: 0,
    itemAnswerBatches: [] as number[],
    itemViewUpserts: 0,
    audits: [] as string[],
  };
  const repository: SurveySubmissionRepository = {
    async isUserAssignedToCourse() {
      return opts.assigned ?? true;
    },
    async loadItemSurveyContext() {
      return opts.context === undefined ? makeContext() : opts.context;
    },
    async loadCourseSurveyContext() {
      return null;
    },
    async loadLearner() {
      return {
        id: "u1",
        name: opts.learnerName ?? "Иван",
        email: "ivan@corp.ru",
        login: "ivan",
      };
    },
    async hasItemResponse() {
      return opts.hasResponse ?? false;
    },
    async hasCourseResponse() {
      return false;
    },
    async transact(execute) {
      return execute({
        async createItemResponse() {
          state.itemResponses += 1;
          return { id: `r-${state.itemResponses}` };
        },
        async createItemAnswers(_responseId, answers) {
          void _responseId;
          state.itemAnswerBatches.push(answers.length);
        },
        async upsertItemView() {
          state.itemViewUpserts += 1;
        },
        async createCourseResponse() {
          return { id: "not-used" };
        },
        async createCourseAnswers() {},
        async recordEffects(effects) {
          if (effects.audit) state.audits.push(effects.audit.action);
        },
      });
    },
  };
  return { repository, state };
}

const ACTOR = {
  id: "u1",
  login: "ivan",
  name: "Иван",
  displayName: "Иван",
  email: "ivan@corp.ru",
};
const AUDIT = { ipAddress: null, userAgent: null };
const NOW = new Date("2026-05-01T10:00:00Z");

function baseCommand() {
  return {
    courseId: "c1",
    itemId: "i1",
    actor: ACTOR,
    audit: AUDIT,
    now: NOW,
    getRawAnswer: () => "text",
    parseQuestionOptionsJson: () => [] as string[],
  };
}

test("не назначен → REDIRECT_HOME", async () => {
  const { repository, state } = makeRepository({ assigned: false });
  const submit = createSubmitCourseItemSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "REDIRECT_HOME");
  assert.equal(state.itemResponses, 0);
});

test("курс DRAFT → REDIRECT_HOME", async () => {
  const { repository } = makeRepository({
    context: makeContext({
      course: {
        id: "c1",
        title: "Курс",
        status: "DRAFT",
        navigationMode: "FREE",
        quizGateMode: "RESOLVED",
        owner: null,
      },
    }),
  });
  const submit = createSubmitCourseItemSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "REDIRECT_HOME");
});

test("template неактивен → REDIRECT_HOME", async () => {
  const { repository } = makeRepository({
    context: makeContext({
      surveyItem: {
        id: "i1",
        title: "Опрос",
        templateId: "t1",
        templateTitle: "Т1",
        templateIsActive: false,
        questions: [],
      },
    }),
  });
  const submit = createSubmitCourseItemSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "REDIRECT_HOME");
});

test("отклик уже есть → ALREADY_SUBMITTED", async () => {
  const { repository, state } = makeRepository({ hasResponse: true });
  const submit = createSubmitCourseItemSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "ALREADY_SUBMITTED");
  assert.equal(state.itemResponses, 0);
});

test("required вопрос пустой → MISSING_ANSWER", async () => {
  const { repository, state } = makeRepository({});
  const submit = createSubmitCourseItemSurvey({ repository });
  const result = await submit({ ...baseCommand(), getRawAnswer: () => "" });
  assert.equal(result.status, "MISSING_ANSWER");
  if (result.status === "MISSING_ANSWER") {
    assert.equal(result.questionTitle, "Q1");
  }
  assert.equal(state.itemResponses, 0);
});

test("happy-path: response + answers + view + audit", async () => {
  const { repository, state } = makeRepository({});
  const submit = createSubmitCourseItemSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "OK");
  if (result.status === "OK") {
    assert.equal(result.surveyItem.id, "i1");
    assert.equal(result.reportRecipient?.email, "owner@corp.ru");
  }
  assert.equal(state.itemResponses, 1);
  assert.deepEqual(state.itemAnswerBatches, [1]);
  assert.equal(state.itemViewUpserts, 1);
  assert.deepEqual(state.audits, ["course_item_survey:submit"]);
});

test("owner без email → reportRecipient=null, но submit ок", async () => {
  const { repository } = makeRepository({
    context: makeContext({
      course: {
        id: "c1",
        title: "Курс",
        status: "PUBLISHED",
        navigationMode: "FREE",
        quizGateMode: "RESOLVED",
        owner: { name: "Owner", email: null, firstName: "Own" },
      },
    }),
  });
  const submit = createSubmitCourseItemSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "OK");
  if (result.status === "OK") {
    assert.equal(result.reportRecipient, null);
  }
});
