import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveExistingUserInviteAcceptance,
  resolveInviteState,
  userHasStudentRole,
} from "./course-invite-acceptance";

const now = new Date("2026-08-26T12:00:00Z");
const future = new Date("2026-08-27T12:00:00Z");
const past = new Date("2026-08-25T12:00:00Z");

test("resolveInviteState: PENDING и не просрочен → ok", () => {
  assert.deepEqual(resolveInviteState({ status: "PENDING", expiresAt: future }, now), { kind: "ok" });
});

test("resolveInviteState: ACCEPTED → rejected с «уже использовано»", () => {
  const result = resolveInviteState({ status: "ACCEPTED", expiresAt: future }, now);
  assert.equal(result.kind, "rejected");
  if (result.kind === "rejected") assert.match(result.message, /уже использовано/);
});

test("resolveInviteState: прочий не-PENDING статус → rejected «больше не активна»", () => {
  const result = resolveInviteState({ status: "EXPIRED", expiresAt: future }, now);
  assert.equal(result.kind, "rejected");
  if (result.kind === "rejected") assert.match(result.message, /больше не активна/);
});

test("resolveInviteState: PENDING, но просрочен → expired (отдельный kind)", () => {
  const result = resolveInviteState({ status: "PENDING", expiresAt: past }, now);
  assert.equal(result.kind, "expired");
});

test("userHasStudentRole: по основной роли и по профилям", () => {
  assert.equal(userHasStudentRole({ role: "Ученик", userRoles: [] }), true);
  assert.equal(
    userHasStudentRole({ role: "HR", userRoles: [{ roleProfile: { name: "Ученик" } }] }),
    true,
  );
  assert.equal(userHasStudentRole({ role: "HR", userRoles: [] }), false);
});

test("resolveExistingUserInviteAcceptance: активный ученик с тем же логином → ok", () => {
  const result = resolveExistingUserInviteAcceptance({
    user: { status: "ACTIVE", login: "ivan", role: "Ученик", userRoles: [] },
    submittedLogin: "ivan",
  });
  assert.deepEqual(result, { kind: "ok" });
});

test("resolveExistingUserInviteAcceptance: не активный → ошибка блокировки", () => {
  const result = resolveExistingUserInviteAcceptance({
    user: { status: "BLOCKED", login: "ivan", role: "Ученик", userRoles: [] },
    submittedLogin: "ivan",
  });
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.message, /заблокирован/);
});

test("resolveExistingUserInviteAcceptance: без роли Ученик → ошибка", () => {
  const result = resolveExistingUserInviteAcceptance({
    user: { status: "ACTIVE", login: "ivan", role: "HR", userRoles: [] },
    submittedLogin: "ivan",
  });
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.message, /без роли/);
});

test("resolveExistingUserInviteAcceptance: чужой логин → подсказать существующий", () => {
  const result = resolveExistingUserInviteAcceptance({
    user: { status: "ACTIVE", login: "ivan", role: "Ученик", userRoles: [] },
    submittedLogin: "petr",
  });
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.message, /логином ivan/);
});
