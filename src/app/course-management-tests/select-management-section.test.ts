import assert from "node:assert/strict";
import test from "node:test";

import { selectCourseManagementSection } from "../courses/[id]/manage/_queries/select-management-section";

const editor = {
  canEditCourse: true,
  canOpenAccessSection: true,
  canOpenAssignmentsSection: true,
};

test("keeps an allowed requested management section", () => {
  assert.equal(selectCourseManagementSection("reports", editor), "reports");
  assert.equal(selectCourseManagementSection("assignments", editor), "assignments");
});

test("redirect result messages to the section that owns them", () => {
  assert.equal(selectCourseManagementSection("structure", { ...editor, feedbackSaved: "ok" }), "feedback");
  assert.equal(selectCourseManagementSection("structure", { ...editor, statusError: "error" }), "access");
});

test("falls back according to permissions", () => {
  assert.equal(selectCourseManagementSection("reports", {
    canEditCourse: false,
    canOpenAccessSection: true,
    canOpenAssignmentsSection: true,
  }), "access");
  assert.equal(selectCourseManagementSection("unknown", {
    canEditCourse: false,
    canOpenAccessSection: false,
    canOpenAssignmentsSection: true,
  }), "assignments");
});
