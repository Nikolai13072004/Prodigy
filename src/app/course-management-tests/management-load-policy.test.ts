import assert from "node:assert/strict";
import test from "node:test";

import { getCourseManagementLoadPolicy } from "../courses/[id]/manage/_queries/management-load-policy";

test("lightweight editor sections do not load section-specific collections", () => {
  for (const section of ["structure", "basics", "access"] as const) {
    assert.deepEqual(getCourseManagementLoadPolicy(section), {
      assignmentDirectory: false,
      broadcastAudience: false,
      reportData: false,
      manualReviews: false,
      feedback: false,
      survey: false,
    });
  }
});

test("assignments load the directory and messaging audience only", () => {
  assert.deepEqual(getCourseManagementLoadPolicy("assignments"), {
    assignmentDirectory: true,
    broadcastAudience: true,
    reportData: false,
    manualReviews: false,
    feedback: false,
    survey: false,
  });
});

test("reports load learner and reporting data without unrelated collections", () => {
  assert.deepEqual(getCourseManagementLoadPolicy("reports"), {
    assignmentDirectory: true,
    broadcastAudience: false,
    reportData: true,
    manualReviews: false,
    feedback: false,
    survey: false,
  });
});

test("review, feedback, and survey sections load only their own data", () => {
  assert.equal(getCourseManagementLoadPolicy("reviews").manualReviews, true);
  assert.equal(getCourseManagementLoadPolicy("feedback").feedback, true);
  assert.equal(getCourseManagementLoadPolicy("survey").survey, true);
  assert.equal(getCourseManagementLoadPolicy("reviews").feedback, false);
  assert.equal(getCourseManagementLoadPolicy("feedback").survey, false);
  assert.equal(getCourseManagementLoadPolicy("survey").manualReviews, false);
});
