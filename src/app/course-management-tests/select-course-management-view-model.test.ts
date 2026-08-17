import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCourseAttentionCards,
  countExpiringAssignments,
  normalizeReturnUserId,
  selectCourseManagementTabs,
} from "@/app/courses/[id]/manage/_queries/select-course-management-view-model";

test("management tabs follow permissions and keep the survey action-only tab behavior", () => {
  const permissions = {
    canEditCourse: true,
    canOpenAccessSection: true,
    canOpenAssignmentsSection: true,
  };

  assert.equal(selectCourseManagementTabs("basics", permissions).some((tab) => tab.key === "survey"), false);
  assert.equal(selectCourseManagementTabs("survey", permissions).some((tab) => tab.key === "survey"), true);
  assert.deepEqual(
    selectCourseManagementTabs("assignments", {
      canEditCourse: false,
      canOpenAccessSection: false,
      canOpenAssignmentsSection: true,
    }),
    [{ key: "assignments", label: "Назначения" }]
  );
});

test("attention cards contain only actionable non-zero counters", () => {
  const cards = buildCourseAttentionCards({
    courseId: "course 1",
    pendingReviewCount: 2,
    pendingFeedbackCount: 0,
    failedEmailCount: 1,
    expiringAssignmentCount: 0,
  });

  assert.deepEqual(cards.map((card) => card.value), [2, 1]);
  assert.equal(cards[1]?.href, "/admin/reports/email-queue?status=FAILED&q=course%201");
});

test("assignment expiry includes both ends of the seven-day window", () => {
  const now = new Date("2026-08-14T10:00:00.000Z");
  assert.equal(
    countExpiringAssignments(
      [
        new Date("2026-08-14T09:59:59.999Z"),
        new Date("2026-08-14T10:00:00.000Z"),
        new Date("2026-08-21T10:00:00.000Z"),
        new Date("2026-08-21T10:00:00.001Z"),
        null,
      ],
      now
    ),
    2
  );
});

test("return user id accepts safe identifiers only", () => {
  assert.equal(normalizeReturnUserId(" user_01 "), "user_01");
  assert.equal(normalizeReturnUserId("../admin"), "");
});
