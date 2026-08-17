import assert from "node:assert/strict";
import test from "node:test";

import { selectRequiredQuizStatusReport } from "../courses/[id]/manage/_queries/select-course-report";

const learners = ["passed", "failed", "review", "progress", "new"].map((id) => ({
  id,
  name: id,
  login: id,
  department: "Обучение",
  assignmentSource: "Напрямую",
  assignedAt: null,
}));

test("projects required quiz precedence and summary without database access", () => {
  const report = selectRequiredQuizStatusReport({
    assignedLearners: learners,
    requiredQuizIds: ["quiz-1", "quiz-2"],
    bestResults: [
      { userId: "passed", quizId: "quiz-1", status: "PASSED" },
      { userId: "passed", quizId: "quiz-2", status: "PASSED" },
      { userId: "failed", quizId: "quiz-1", status: "PASSED" },
      { userId: "failed", quizId: "quiz-2", status: "FAILED" },
      { userId: "review", quizId: "quiz-1", status: "PENDING_REVIEW" },
      { userId: "progress", quizId: "quiz-1", status: "PASSED" },
    ],
    inProgressAttempts: [{ userId: "progress", quizId: "quiz-2" }],
    courseCompletionByUserId: new Map([["passed", true]]),
  });

  assert.deepEqual(report.rows.map((row) => row.status), [
    "PASSED",
    "FAILED",
    "PENDING_REVIEW",
    "IN_PROGRESS",
    "NOT_STARTED",
  ]);
  assert.deepEqual(report.summary, {
    assignedLearners: 5,
    passed: 1,
    failed: 1,
    inProgress: 1,
    pendingReview: 1,
    notStarted: 1,
  });
  assert.equal(report.rows[0].courseCompleted, true);
});

test("returns an explicit no-test projection", () => {
  const report = selectRequiredQuizStatusReport({
    assignedLearners: learners.slice(0, 1),
    requiredQuizIds: [],
    bestResults: [],
    inProgressAttempts: [],
    courseCompletionByUserId: new Map(),
  });

  assert.equal(report.hasRequiredQuiz, false);
  assert.equal(report.rows[0].status, "NO_TEST");
});
