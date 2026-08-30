import assert from "node:assert/strict";
import test from "node:test";
import { planInviteRecipients } from "./invite-recipient-plan";

test("classifies invite emails without database or form dependencies", () => {
  const plan = planInviteRecipients({
    inviteEmails: ["student@test.ru", "blocked@test.ru", "admin@test.ru", "new@test.ru"],
    existingUsers: [
      { id: "student", email: "Student@Test.ru", status: "ACTIVE", roleNames: ["Ученик"] },
      { id: "blocked", email: "blocked@test.ru", status: "BLOCKED", roleNames: ["Ученик"] },
      { id: "admin", email: "admin@test.ru", status: "ACTIVE", roleNames: ["Администратор"] },
    ],
    activeStatus: "ACTIVE",
    studentRoleName: "Ученик",
  });

  assert.deepEqual(plan.directUserIds, ["student"]);
  assert.deepEqual(plan.blockedEmails, ["blocked@test.ru"]);
  assert.deepEqual(plan.nonStudentEmails, ["admin@test.ru"]);
  assert.deepEqual(plan.pendingInviteEmails, ["new@test.ru"]);
  assert.deepEqual(plan.existingUserEmails, ["student@test.ru", "blocked@test.ru", "admin@test.ru"]);
});
