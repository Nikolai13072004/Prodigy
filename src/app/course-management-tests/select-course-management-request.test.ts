import assert from "node:assert/strict";
import test from "node:test";
import { selectCourseManagementRequest } from "@/app/courses/[id]/manage/_queries/select-course-management-request";

const editorPermissions = {
  canEditCourse: true,
  canOpenAccessSection: true,
  canOpenAssignmentsSection: true,
};

test("projects query parameters into section-owned request contracts", () => {
  const request = selectCourseManagementRequest(
    {
      section: "structure",
      editItem: "item-1",
      editModule: "module-1",
      structureSaved: "saved",
      fromUser: "user-1",
      reviewStatus: "reviewed",
      attempt: "attempt-1",
    },
    editorPermissions
  );

  assert.equal(request.activeSection, "structure");
  assert.deepEqual(request.structureEditor, {
    selectedItemId: "item-1",
    selectedModuleId: "module-1",
  });
  assert.equal(request.messages.structure.saved, "saved");
  assert.equal(request.navigation.fromUser, "user-1");
  assert.equal(request.reviewStatusFilter, "reviewed");
  assert.equal(request.selectedAttemptId, "attempt-1");
});

test("action messages select the section that owns them", () => {
  const request = selectCourseManagementRequest(
    { section: "structure", assignmentWarning: "partial assignment" },
    editorPermissions
  );

  assert.equal(request.activeSection, "assignments");
  assert.equal(request.messages.assignments.assignmentWarning, "partial assignment");
});

test("duplicate query parameters use the first URL value", () => {
  const request = selectCourseManagementRequest(
    {
      section: ["feedback", "reports"],
      feedbackError: ["first", "second"],
      reviewStatus: ["invalid", "pending"],
    },
    editorPermissions
  );

  assert.equal(request.activeSection, "feedback");
  assert.equal(request.messages.feedback.error, "first");
  assert.equal(request.reviewStatusFilter, "all");
});
