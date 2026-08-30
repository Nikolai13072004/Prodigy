import assert from "node:assert/strict";
import test from "node:test";
import { CourseProgressionError, planCourseProgression } from "./progression-settings";

const items = [
  { id: "lesson", type: "TEXT" },
  { id: "quiz", type: "QUIZ" },
];

test("all-items progression derives required ids from server items", () => {
  const plan = planCourseProgression({
    items,
    navigationMode: "SEQUENTIAL",
    quizGateMode: "PASSED",
    completionMode: "ALL_ITEMS",
    statusFormat: "PASSED_WITH_SCORE",
    requestedRequiredItemIds: ["unknown"],
    requestedGradedItemIds: ["quiz", "unknown"],
  });

  assert.deepEqual(plan.requiredItemIds, ["lesson", "quiz"]);
  assert.deepEqual(plan.gradedItemIds, ["quiz"]);
});

test("non-gradable required content forces completed-only status", () => {
  const plan = planCourseProgression({
    items,
    navigationMode: "FREE",
    quizGateMode: "RESOLVED",
    completionMode: "REQUIRED_ITEMS",
    statusFormat: "PASSED_WITH_SCORE",
    requestedRequiredItemIds: ["lesson"],
    requestedGradedItemIds: ["quiz"],
  });

  assert.equal(plan.statusFormat, "COMPLETED_ONLY");
  assert.deepEqual(plan.gradedItemIds, []);
});

test("scored progression requires a selected required quiz", () => {
  assert.throws(
    () => planCourseProgression({
      items,
      navigationMode: "FREE",
      quizGateMode: "RESOLVED",
      completionMode: "REQUIRED_ITEMS",
      statusFormat: "PASSED_WITH_SCORE",
      requestedRequiredItemIds: ["lesson", "quiz"],
      requestedGradedItemIds: [],
    }),
    CourseProgressionError,
  );
});

test("progression rejects stale modes and an empty required selection", () => {
  assert.throws(
    () => planCourseProgression({
      items,
      navigationMode: "INVALID",
      quizGateMode: "RESOLVED",
      completionMode: "REQUIRED_ITEMS",
      statusFormat: "COMPLETED_ONLY",
      requestedRequiredItemIds: [],
      requestedGradedItemIds: [],
    }),
    /режим прохождения/,
  );
  assert.throws(
    () => planCourseProgression({
      items,
      navigationMode: "FREE",
      quizGateMode: "RESOLVED",
      completionMode: "REQUIRED_ITEMS",
      statusFormat: "COMPLETED_ONLY",
      requestedRequiredItemIds: [],
      requestedGradedItemIds: [],
    }),
    /обязательный материал/,
  );
});
