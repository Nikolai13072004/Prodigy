import assert from "node:assert/strict";
import test from "node:test";
import type { BestResultWrite } from "./ports";
import type {
  AssessmentReviewRepository,
  AssessmentReviewTransaction,
  ReviewTargetAttempt,
} from "./review-ports";
import {
  AssessmentReviewApplicationError,
  createReviewAssessmentAttempt,
} from "./review-assessment-attempt";

function createTarget(outcome = "PENDING_REVIEW"): ReviewTargetAttempt {
  return {
    id: "attempt-1",
    quizId: "quiz-1",
    userId: "user-1",
    attemptNumber: 1,
    outcome,
    answers: JSON.stringify({ auto: "1", manual: "Развёрнутый ответ" }),
    questionSnapshot: JSON.stringify([
      {
        id: "auto",
        orderIndex: 0,
        type: "SINGLE_CHOICE",
        prompt: "Автоматический",
        config: JSON.stringify({ options: ["Нет", "Да"], correctIndex: 1 }),
        points: 2,
      },
      {
        id: "manual",
        orderIndex: 1,
        type: "OPEN",
        prompt: "Ручной",
        config: JSON.stringify({ reviewMode: "MANUAL" }),
        points: 3,
      },
    ]),
    score: 2,
    maxScore: 5,
    correctAnswers: 1,
    totalQuestions: 2,
    manualReviewJson: null,
    reviewComment: null,
    reviewedAt: null,
    reviewedById: null,
    reviewedByName: null,
    createdAt: new Date("2026-08-13T10:00:00Z"),
    completedAt: new Date("2026-08-13T10:05:00Z"),
  };
}

function createRepository(initialOutcome = "PENDING_REVIEW") {
  const state: { target: ReviewTargetAttempt; best: BestResultWrite | null } = {
    target: createTarget(initialOutcome),
    best: null,
  };
  const repository: AssessmentReviewRepository = {
    async transactReview({ execute }) {
      const transaction: AssessmentReviewTransaction = {
        target: state.target,
        quiz: { id: "quiz-1", minCorrectAnswers: 2, maxAttempts: 2 },
        attempts: [state.target],
        async updateTarget(data) {
          state.target = { ...state.target, ...data };
          return state.target;
        },
        async saveBestResult(data) {
          state.best = data;
        },
      };
      return execute(transaction);
    },
  };
  return { repository, state };
}

test("review updates attempt and best-result projection atomically", async () => {
  const { repository, state } = createRepository();
  const review = createReviewAssessmentAttempt(repository);
  const result = await review({
    attemptId: "attempt-1",
    reviewer: { id: "teacher-1", name: "Преподаватель" },
    review: { manual: { accepted: true, awardedPoints: 3 } },
    comment: "Зачтено",
    expectedReviewedAt: null,
    now: new Date("2026-08-13T11:00:00Z"),
  });
  assert.equal(result.outcome, "PASSED");
  assert.equal(state.target.score, 5);
  assert.equal(state.target.reviewedById, "teacher-1");
  assert.equal(state.best?.status, "PASSED");
  assert.equal(state.best?.bestAttemptId, "attempt-1");
});

test("an in-progress attempt cannot be reviewed", async () => {
  const { repository } = createRepository("IN_PROGRESS");
  const review = createReviewAssessmentAttempt(repository);
  await assert.rejects(
    review({
      attemptId: "attempt-1",
      reviewer: { id: "teacher-1", name: "Преподаватель" },
      review: { manual: { accepted: true, awardedPoints: 3 } },
      comment: null,
      expectedReviewedAt: null,
    }),
    (error: unknown) =>
      error instanceof AssessmentReviewApplicationError && error.code === "ATTEMPT_NOT_REVIEWABLE",
  );
});

test("a stale review cannot overwrite a newer teacher decision", async () => {
  const { repository, state } = createRepository();
  state.target.reviewedAt = new Date("2026-08-13T10:30:00Z");
  const review = createReviewAssessmentAttempt(repository);
  await assert.rejects(
    review({
      attemptId: "attempt-1",
      reviewer: { id: "teacher-2", name: "Второй преподаватель" },
      review: { manual: { accepted: false, awardedPoints: 0 } },
      comment: "Изменено",
      expectedReviewedAt: null,
    }),
    (error: unknown) =>
      error instanceof AssessmentReviewApplicationError && error.code === "REVIEW_CONFLICT",
  );
  assert.equal(state.target.reviewComment, null);
});
