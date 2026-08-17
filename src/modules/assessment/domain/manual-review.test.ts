import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeManualAssessmentReview,
  ManualAssessmentReviewError,
} from "./manual-review";
import type { AssessmentQuestion } from "./assessment";

const questions: AssessmentQuestion[] = [
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
    points: 5,
  },
];

test("manual points are clamped and combined with server auto-score", () => {
  const result = finalizeManualAssessmentReview({
    questions,
    answers: { auto: "1", manual: "Ответ" },
    review: { manual: { accepted: true, awardedPoints: 999 } },
    minCorrectAnswers: 2,
  });
  assert.equal(result.score, 7);
  assert.equal(result.maxScore, 7);
  assert.equal(result.correctAnswers, 2);
  assert.equal(result.outcome, "PASSED");
});

test("every manual question requires an explicit review", () => {
  assert.throws(
    () => finalizeManualAssessmentReview({
      questions,
      answers: { auto: "1", manual: "Ответ" },
      review: {},
      minCorrectAnswers: 1,
    }),
    ManualAssessmentReviewError,
  );
});
