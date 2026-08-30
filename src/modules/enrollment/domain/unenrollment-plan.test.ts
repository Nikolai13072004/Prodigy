import assert from "node:assert/strict";
import { test } from "node:test";
import { planLearnerUnenrollment } from "./unenrollment-plan";

// Решение об отчислении: групповое гасится override, прямое удаляется, ничего — отказ.

test("нет назначений → отчислять нечего", () => {
  assert.deepEqual(
    planLearnerUnenrollment({ hadDirectAssignment: false, hadGroupAssignment: false }),
    { valid: false, reason: "NO_ASSIGNMENT" }
  );
});

test("только прямое → удаляем прямое назначение", () => {
  assert.deepEqual(
    planLearnerUnenrollment({ hadDirectAssignment: true, hadGroupAssignment: false }),
    { valid: true, assignmentAction: "DELETE_DIRECT" }
  );
});

test("групповое → гасим просроченным override (даже если есть и прямое)", () => {
  assert.deepEqual(
    planLearnerUnenrollment({ hadDirectAssignment: false, hadGroupAssignment: true }),
    { valid: true, assignmentAction: "OVERRIDE_EXPIRE" }
  );
  assert.deepEqual(
    planLearnerUnenrollment({ hadDirectAssignment: true, hadGroupAssignment: true }),
    { valid: true, assignmentAction: "OVERRIDE_EXPIRE" }
  );
});
