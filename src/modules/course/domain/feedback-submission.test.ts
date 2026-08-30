import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidFeedbackRating, resolveFeedbackStatus } from "./feedback-submission";

test("оценка допустима только целая 1..5", () => {
  for (const ok of [1, 2, 3, 4, 5]) assert.equal(isValidFeedbackRating(ok), true, `${ok}`);
  for (const bad of [0, 6, -1, 3.5, Number.NaN]) assert.equal(isValidFeedbackRating(bad), false, `${bad}`);
});

test("статус отзыва: модерация → PENDING, иначе PUBLISHED", () => {
  assert.equal(resolveFeedbackStatus(true), "PENDING");
  assert.equal(resolveFeedbackStatus(false), "PUBLISHED");
});
