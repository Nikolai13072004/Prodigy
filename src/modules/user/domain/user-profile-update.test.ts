import assert from "node:assert/strict";
import { test } from "node:test";
import {
  haveRolesChanged,
  isSelfBlockAttempt,
  resolveEditedUserStatus,
} from "./user-profile-update";

const base = {
  canEditAccessLevel: true,
  statusControl: "activity-toggle",
  currentStatus: "ACTIVE",
  activeUserChecked: true,
  statusRaw: "",
};

test("без права смены доступа статус не меняется", () => {
  assert.equal(
    resolveEditedUserStatus({ ...base, canEditAccessLevel: false, activeUserChecked: false }),
    "ACTIVE",
  );
});

test("activity-toggle: архивного не трогаем", () => {
  assert.equal(
    resolveEditedUserStatus({ ...base, currentStatus: "ARCHIVED", activeUserChecked: false }),
    "ARCHIVED",
  );
});

test("activity-toggle: снят чекбокс → BLOCKED", () => {
  assert.equal(resolveEditedUserStatus({ ...base, activeUserChecked: false }), "BLOCKED");
});

test("activity-toggle: был BLOCKED и включили → ACTIVE", () => {
  assert.equal(
    resolveEditedUserStatus({ ...base, currentStatus: "BLOCKED", activeUserChecked: true }),
    "ACTIVE",
  );
});

test("activity-toggle: ACTIVE и включён → без изменений", () => {
  assert.equal(resolveEditedUserStatus({ ...base, currentStatus: "ACTIVE", activeUserChecked: true }), "ACTIVE");
});

test("прямой выбор: редактируемый статус принимается, нередактируемый — нет", () => {
  assert.equal(
    resolveEditedUserStatus({ ...base, statusControl: "select", statusRaw: "PENDING" }),
    "PENDING",
  );
  assert.equal(
    resolveEditedUserStatus({ ...base, statusControl: "select", currentStatus: "ACTIVE", statusRaw: "ARCHIVED" }),
    "ACTIVE",
    "ARCHIVED не редактируемый → статус не меняется",
  );
});

test("isSelfBlockAttempt: свой не-BLOCKED → BLOCKED = true; чужой или уже BLOCKED = false", () => {
  assert.equal(
    isSelfBlockAttempt({ sessionUserId: "u1", targetUserId: "u1", nextStatus: "BLOCKED", currentStatus: "ACTIVE" }),
    true,
  );
  assert.equal(
    isSelfBlockAttempt({ sessionUserId: "u1", targetUserId: "u2", nextStatus: "BLOCKED", currentStatus: "ACTIVE" }),
    false,
  );
  assert.equal(
    isSelfBlockAttempt({ sessionUserId: "u1", targetUserId: "u1", nextStatus: "BLOCKED", currentStatus: "BLOCKED" }),
    false,
  );
});

test("haveRolesChanged: состав, без учёта порядка", () => {
  assert.equal(haveRolesChanged(["A", "B"], ["B", "A"]), false);
  assert.equal(haveRolesChanged(["A"], ["A", "B"]), true);
  assert.equal(haveRolesChanged(["A", "B"], ["A", "C"]), true);
});
