import assert from "node:assert/strict";
import { test } from "node:test";
import { createManageCourseFeedback } from "./manage-course-feedback";
import { CourseFeedbackApplicationError } from "./course-feedback-errors";
import type {
  CourseFeedbackEffects,
  CourseFeedbackRepository,
  FeedbackModerationRecord,
  MyFeedbackRecord,
  UpsertFeedbackInput,
} from "./course-feedback-ports";

const ACTOR = { id: "admin-1", login: null, name: null };
const AUDIT = { ipAddress: null, userAgent: null };

function makeRepository(opts: {
  percent?: number | null;
  myFeedback?: MyFeedbackRecord | null;
  moderation?: FeedbackModerationRecord | null;
}) {
  const state = {
    upserts: [] as UpsertFeedbackInput[],
    deleted: [] as string[],
    published: [] as string[],
    effects: [] as CourseFeedbackEffects[],
  };
  const repository: CourseFeedbackRepository = {
    async getCompletionPercent() {
      return opts.percent === undefined ? 100 : opts.percent;
    },
    async findMyFeedback() {
      return opts.myFeedback === undefined
        ? { id: "f1", rating: 4, comment: "ок", courseTitle: "Курс" }
        : opts.myFeedback;
    },
    async findModeration() {
      return opts.moderation === undefined
        ? {
            id: "f1",
            status: "PENDING",
            courseId: "c1",
            learnerId: "u1",
            learnerName: "Ученик",
            learnerLogin: "student",
            courseTitle: "Курс",
          }
        : opts.moderation;
    },
    async transact(execute) {
      return execute({
        async upsertFeedback(input) {
          state.upserts.push(input);
        },
        async deleteFeedback(id) {
          state.deleted.push(id);
        },
        async publishFeedback(id) {
          state.published.push(id);
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      });
    },
  };
  return { repository, state };
}

test("submit: курс не найден → COURSE_NOT_FOUND", async () => {
  const { repository } = makeRepository({ percent: null });
  const m = createManageCourseFeedback({ repository });
  await assert.rejects(
    m.submit({ courseId: "c1", userId: "u1", rating: 5, comment: null, moderationEnabled: false }),
    (e) => e instanceof CourseFeedbackApplicationError && e.code === "COURSE_NOT_FOUND",
  );
});

test("submit: курс не завершён (<100%) → NOT_COMPLETE", async () => {
  const { repository, state } = makeRepository({ percent: 80 });
  const m = createManageCourseFeedback({ repository });
  await assert.rejects(
    m.submit({ courseId: "c1", userId: "u1", rating: 5, comment: null, moderationEnabled: false }),
    (e) => e instanceof CourseFeedbackApplicationError && e.code === "NOT_COMPLETE",
  );
  assert.equal(state.upserts.length, 0);
});

test("submit: некорректная оценка → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository({ percent: 100 });
  const m = createManageCourseFeedback({ repository });
  await assert.rejects(
    m.submit({ courseId: "c1", userId: "u1", rating: 9, comment: null, moderationEnabled: false }),
    (e) => e instanceof CourseFeedbackApplicationError && e.code === "VALIDATION_FAILED",
  );
});

test("submit happy-path: без модерации → PUBLISHED, upsert", async () => {
  const { repository, state } = makeRepository({ percent: 100 });
  const m = createManageCourseFeedback({ repository });
  const res = await m.submit({ courseId: "c1", userId: "u1", rating: 5, comment: "класс", moderationEnabled: false });
  assert.equal(res.status, "PUBLISHED");
  assert.equal(state.upserts[0].rating, 5);
  assert.equal(state.upserts[0].status, "PUBLISHED");
});

test("submit: с модерацией → PENDING", async () => {
  const { repository, state } = makeRepository({ percent: 100 });
  const m = createManageCourseFeedback({ repository });
  const res = await m.submit({ courseId: "c1", userId: "u1", rating: 5, comment: null, moderationEnabled: true });
  assert.equal(res.status, "PENDING");
  assert.equal(state.upserts[0].status, "PENDING");
});

test("deleteMine: нет отзыва → FEEDBACK_NOT_FOUND", async () => {
  const { repository, state } = makeRepository({ myFeedback: null });
  const m = createManageCourseFeedback({ repository });
  await assert.rejects(
    m.deleteMine({ courseId: "c1", userId: "u1", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof CourseFeedbackApplicationError && e.code === "FEEDBACK_NOT_FOUND",
  );
  assert.equal(state.deleted.length, 0);
});

test("deleteMine happy-path: delete + аудит course_feedback:delete", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageCourseFeedback({ repository });
  await m.deleteMine({ courseId: "c1", userId: "u1", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.deleted, ["f1"]);
  assert.equal(state.effects[0].audit.action, "course_feedback:delete");
});

test("publish: уже опубликован → ALREADY_PUBLISHED", async () => {
  const { repository, state } = makeRepository({
    moderation: {
      id: "f1", status: "PUBLISHED", courseId: "c1",
      learnerId: "u1", learnerName: "У", learnerLogin: "s", courseTitle: "Курс",
    },
  });
  const m = createManageCourseFeedback({ repository });
  await assert.rejects(
    m.publish({ courseId: "c1", feedbackId: "f1", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof CourseFeedbackApplicationError && e.code === "ALREADY_PUBLISHED",
  );
  assert.equal(state.published.length, 0);
});

test("publish happy-path: publish + аудит", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageCourseFeedback({ repository });
  await m.publish({ courseId: "c1", feedbackId: "f1", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.published, ["f1"]);
  assert.equal(state.effects[0].audit.action, "course_feedback:publish");
});

test("publish: не найден → FEEDBACK_NOT_FOUND", async () => {
  const { repository } = makeRepository({ moderation: null });
  const m = createManageCourseFeedback({ repository });
  await assert.rejects(
    m.publish({ courseId: "c1", feedbackId: "missing", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof CourseFeedbackApplicationError && e.code === "FEEDBACK_NOT_FOUND",
  );
});
