import assert from "node:assert/strict";
import test from "node:test";

import {
  selectAssignedCourseLearners,
  selectAssignmentAccessLabel,
  selectCourseAssignmentDirectory,
} from "../courses/[id]/manage/_queries/select-course-assignments";

const users = [
  {
    id: "direct",
    name: "Прямой ученик",
    login: "direct",
    status: "ACTIVE",
    department: null,
    groupMemberships: [],
  },
  {
    id: "group",
    name: null,
    login: "group-login",
    status: "ACTIVE",
    department: { name: "Продажи" },
    groupMemberships: [{ group: { id: "group-1", name: "Первая группа" } }],
  },
];

const course = {
  directAssignments: [
    { userId: "direct", assignedAt: new Date("2026-08-03T00:00:00Z"), expiresAt: null },
  ],
  groupAssignments: [
    { groupId: "group-1", assignedAt: new Date("2026-08-05T00:00:00Z"), expiresAt: null },
  ],
  invites: [{ email: "new@example.test", accessExpiresAt: null }],
};

test("projects assignment directory without leaking persistence relations into UI", () => {
  const result = selectCourseAssignmentDirectory({
    users,
    groups: [{ id: "group-1", name: "Первая группа" }],
    course,
  });

  assert.deepEqual(result.initiallyAssignedUserIds, ["direct"]);
  assert.deepEqual(result.initiallyAssignedGroupIds, ["group-1"]);
  assert.deepEqual(result.pendingInviteEmails, ["new@example.test"]);
  assert.equal(result.users[1].name, "group-login");
  assert.equal(result.users[0].department, "Без подразделения");
  assert.equal(result.accessLabel, "Бессрочно");
});

test("merges direct and group assignments into a stable learner projection", () => {
  const result = selectAssignedCourseLearners({ users, course });

  assert.deepEqual(result.map((learner) => learner.id), ["group", "direct"]);
  assert.equal(result[0].assignmentSource, "Первая группа");
  assert.equal(result[1].assignmentSource, "Напрямую");
});

test("summarizes assignment expiry variants", () => {
  const date = new Date("2026-09-01T00:00:00Z");
  assert.equal(selectAssignmentAccessLabel([]), "Не задан");
  assert.equal(selectAssignmentAccessLabel([null, null]), "Бессрочно");
  assert.equal(selectAssignmentAccessLabel([date]), `До ${date.toLocaleDateString("ru-RU")}`);
  assert.equal(selectAssignmentAccessLabel([null, date]), "Разные сроки");
});
