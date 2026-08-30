import assert from "node:assert/strict";
import test from "node:test";

import { selectCourseCompletionByLearner } from "../courses/[id]/manage/_queries/select-course-progress-report";

test("calculates completion independently for every assigned learner", () => {
  const result = selectCourseCompletionByLearner({
    course: { title: "Курс", description: null, quizGateMode: "PASSED" },
    learnerIds: ["complete", "incomplete"],
    items: [
      {
        id: "material",
        type: "PDF",
        isRequired: true,
        views: [
          { userId: "complete", progressPercent: 100 },
          { userId: "incomplete", progressPercent: 50 },
        ],
        quiz: null,
      },
      {
        id: "quiz-item",
        type: "QUIZ",
        isRequired: true,
        views: [],
        quiz: {
          id: "quiz",
          maxAttempts: 2,
          minCorrectAnswers: 1,
          attempts: [
            {
              userId: "complete",
              outcome: "PASSED",
              correctAnswers: 1,
              attemptNumber: 1,
              score: 1,
              completedAt: new Date("2026-08-13T10:00:00Z"),
            },
          ],
        },
      },
    ],
  });

  assert.equal(result.get("complete"), true);
  assert.equal(result.get("incomplete"), false);
});

test("keeps learners isolated when quiz attempts belong to another user", () => {
  const result = selectCourseCompletionByLearner({
    course: { title: "Курс", description: null, quizGateMode: "PASSED" },
    learnerIds: ["owner", "other"],
    items: [
      {
        id: "quiz-item",
        type: "QUIZ",
        isRequired: true,
        views: [],
        quiz: {
          id: "quiz",
          maxAttempts: 1,
          minCorrectAnswers: 1,
          attempts: [
            {
              userId: "owner",
              outcome: "PASSED",
              correctAnswers: 1,
              attemptNumber: 1,
              score: 1,
              completedAt: new Date("2026-08-13T10:00:00Z"),
            },
          ],
        },
      },
    ],
  });

  assert.equal(result.get("owner"), true);
  assert.equal(result.get("other"), false);
});
