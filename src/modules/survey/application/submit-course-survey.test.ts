import assert from "node:assert/strict";
import { test } from "node:test";
import { createSubmitCourseSurvey } from "./submit-course-survey";
import type {
  CourseSurveyContext,
  SurveySubmissionRepository,
} from "./survey-submission-ports";

function makeContext(overrides: Partial<CourseSurveyContext> = {}): CourseSurveyContext {
  return {
    course: {
      id: "c1",
      title: "Курс",
      quizGateMode: "RESOLVED",
      owner: { name: "Owner", email: "owner@corp.ru", firstName: "Own" },
    },
    items: [
      {
        id: "i1",
        type: "TEXT",
        title: "Материал",
        isRequired: true,
        views: [{ progressPercent: 100 }],
        quiz: null,
      },
    ],
    surveyTemplate: {
      id: "t1",
      title: "Опрос",
      isActive: true,
      questions: [
        {
          id: "q1",
          title: "Q1",
          type: "TEXT",
          optionsJson: null,
          isRequired: false,
        },
      ],
    },
    ...overrides,
  };
}

function makeRepository(opts: {
  assigned?: boolean;
  context?: CourseSurveyContext | null;
  hasResponse?: boolean;
}) {
  const state = {
    courseResponses: 0,
    courseAnswerBatches: [] as number[],
    audits: [] as string[],
  };
  const repository: SurveySubmissionRepository = {
    async isUserAssignedToCourse() {
      return opts.assigned ?? true;
    },
    async loadItemSurveyContext() {
      return null;
    },
    async loadCourseSurveyContext() {
      return opts.context === undefined ? makeContext() : opts.context;
    },
    async loadLearner() {
      return { id: "u1", name: "Иван", email: null, login: "ivan" };
    },
    async hasItemResponse() {
      return false;
    },
    async hasCourseResponse() {
      return opts.hasResponse ?? false;
    },
    async transact(execute) {
      return execute({
        async createItemResponse() {
          return { id: "not-used" };
        },
        async createItemAnswers() {},
        async upsertItemView() {},
        async createCourseResponse() {
          state.courseResponses += 1;
          return { id: `r-${state.courseResponses}` };
        },
        async createCourseAnswers(_responseId, answers) {
          void _responseId;
          state.courseAnswerBatches.push(answers.length);
        },
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
    actor: ACTOR,
    audit: AUDIT,
    now: NOW,
    getRawAnswer: () => "value",
    parseQuestionOptionsJson: () => [] as string[],
  };
}

test("не назначен → REDIRECT_HOME", async () => {
  const { repository } = makeRepository({ assigned: false });
  const submit = createSubmitCourseSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "REDIRECT_HOME");
});

test("нет surveyTemplate → REDIRECT_HOME", async () => {
  const { repository } = makeRepository({
    context: makeContext({ surveyTemplate: null }),
  });
  const submit = createSubmitCourseSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "REDIRECT_HOME");
});

test("template inactive → REDIRECT_HOME", async () => {
  const { repository } = makeRepository({
    context: makeContext({
      surveyTemplate: {
        id: "t1",
        title: "Опрос",
        isActive: false,
        questions: [],
      },
    }),
  });
  const submit = createSubmitCourseSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "REDIRECT_HOME");
});

test("курс не пройден → COURSE_NOT_COMPLETED", async () => {
  const { repository } = makeRepository({
    context: makeContext({
      items: [
        {
          id: "i1",
          type: "TEXT",
          title: "Материал",
          isRequired: true,
          views: [{ progressPercent: 10 }],
          quiz: null,
        },
      ],
    }),
  });
  const submit = createSubmitCourseSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "COURSE_NOT_COMPLETED");
});

test("уже отправлено → ALREADY_SUBMITTED", async () => {
  const { repository, state } = makeRepository({ hasResponse: true });
  const submit = createSubmitCourseSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "ALREADY_SUBMITTED");
  assert.equal(state.courseResponses, 0);
});

test("happy-path: response + answers + audit", async () => {
  const { repository, state } = makeRepository({});
  const submit = createSubmitCourseSurvey({ repository });
  const result = await submit(baseCommand());
  assert.equal(result.status, "OK");
  if (result.status === "OK") {
    assert.equal(result.reportRecipient?.email, "owner@corp.ru");
    assert.equal(result.reportPayload.surveyTitle, "Опрос");
  }
  assert.equal(state.courseResponses, 1);
  assert.deepEqual(state.courseAnswerBatches, [1]);
  assert.deepEqual(state.audits, ["course_survey:submit"]);
});
