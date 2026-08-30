import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveNewUserAccountPlan } from "./new-user-account";

const admin = {
  canEditAccessLevel: true,
  submitModeRaw: "invite",
  sendInviteChecked: false,
  collectedRoles: ["Разработчик курсов"],
  statusRaw: "",
};

test("админ + режим invite: инвайт, генерация пароля, PENDING, нужен токен", () => {
  const plan = resolveNewUserAccountPlan({ ...admin, submitModeRaw: "invite" });
  assert.equal(plan.shouldSendInvite, true);
  assert.equal(plan.passwordSource, "generate");
  assert.equal(plan.status, "PENDING");
  assert.equal(plan.needsActivationToken, true);
  assert.deepEqual(plan.roles, ["Разработчик курсов"]);
  assert.equal(plan.role, "Разработчик курсов");
});

test("админ + режим не-invite: без инвайта, пароль из формы, статус по statusRaw, токен не нужен", () => {
  const plan = resolveNewUserAccountPlan({ ...admin, submitModeRaw: "create", statusRaw: "BLOCKED" });
  assert.equal(plan.shouldSendInvite, false);
  assert.equal(plan.passwordSource, "input");
  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.needsActivationToken, false);
});

test("админ + не-invite + нередактируемый статус (ARCHIVED) → ACTIVE", () => {
  const plan = resolveNewUserAccountPlan({ ...admin, submitModeRaw: "create", statusRaw: "ARCHIVED" });
  assert.equal(plan.status, "ACTIVE");
});

test("HR (без права доступа) + чекбокс инвайта: инвайт, генерация, роль Ученик, ACTIVE, токен не нужен", () => {
  const plan = resolveNewUserAccountPlan({
    canEditAccessLevel: false,
    submitModeRaw: "create", // игнорируется без права доступа
    sendInviteChecked: true,
    collectedRoles: ["Разработчик курсов"], // игнорируется без права доступа
    statusRaw: "BLOCKED", // игнорируется
  });
  assert.equal(plan.shouldSendInvite, true);
  assert.equal(plan.passwordSource, "generate");
  assert.deepEqual(plan.roles, ["Ученик"]);
  assert.equal(plan.role, "Ученик");
  assert.equal(plan.status, "ACTIVE");
  assert.equal(plan.needsActivationToken, false);
});

test("HR без чекбокса инвайта: без отправки, генерация пароля, Ученик/ACTIVE", () => {
  const plan = resolveNewUserAccountPlan({
    canEditAccessLevel: false,
    submitModeRaw: "",
    sendInviteChecked: false,
    collectedRoles: [],
    statusRaw: "",
  });
  assert.equal(plan.shouldSendInvite, false);
  assert.equal(plan.passwordSource, "generate");
  assert.deepEqual(plan.roles, ["Ученик"]);
  assert.equal(plan.status, "ACTIVE");
  assert.equal(plan.needsActivationToken, false);
});

test("админ с пустыми ролями → основная роль откатывается к Ученик", () => {
  const plan = resolveNewUserAccountPlan({ ...admin, submitModeRaw: "create", collectedRoles: [] });
  assert.deepEqual(plan.roles, []);
  assert.equal(plan.role, "Ученик");
});
