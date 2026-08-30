import assert from "node:assert/strict";
import test from "node:test";

import { selectCourseSurveyViewModel } from "../courses/[id]/manage/_queries/select-course-survey";

test("projects survey drafts and rating averages from server data", () => {
  const result = selectCourseSurveyViewModel({
    questions: [
      { id: "rating", title: "Оценка", type: "RATING_5", optionsJson: null, isRequired: true },
      { id: "text", title: "Комментарий", type: "TEXT", optionsJson: null, isRequired: false },
    ],
    responses: [
      { answers: [{ questionId: "rating", ratingValue: 5 }] },
      { answers: [{ questionId: "rating", ratingValue: 4 }] },
      { answers: [{ questionId: "text", ratingValue: null }] },
    ],
  });

  assert.equal(result.responseCount, 3);
  assert.equal(result.requiredQuestionCount, 1);
  assert.deepEqual(result.ratingQuestions, [
    { id: "rating", title: "Оценка", average: 4.5, responseCount: 2 },
  ]);
  assert.equal(result.questionDrafts[1].type, "TEXT");
});

test("uses the default question draft for a course without a survey", () => {
  const result = selectCourseSurveyViewModel(null);
  assert.ok(result.questionDrafts.length > 0);
  assert.equal(result.responseCount, 0);
  assert.deepEqual(result.ratingQuestions, []);
});
