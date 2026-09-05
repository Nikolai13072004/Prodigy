import assert from "node:assert/strict";
import { test } from "node:test";
import { PERMISSIONS } from "@/lib/roles";
import { isSystemRoleRenameAttempt, validateRolePermissionsForm } from "./role-profile-form";

const somePermission = [PERMISSIONS.COURSES_VIEW];

test("validateRolePermissionsForm: пустое имя → ошибка имени", () => {
  assert.equal(validateRolePermissionsForm("", somePermission), "Название роли обязательно");
});

test("validateRolePermissionsForm: нет прав → ошибка прав", () => {
  assert.equal(validateRolePermissionsForm("HR", []), "Выберите хотя бы один доступ");
});

test("validateRolePermissionsForm: имя и права есть → null", () => {
  assert.equal(validateRolePermissionsForm("HR", somePermission), null);
});

test("validateRolePermissionsForm: имя проверяется раньше прав", () => {
  assert.equal(validateRolePermissionsForm("", []), "Название роли обязательно");
});

test("isSystemRoleRenameAttempt: системную роль переименовывают → true", () => {
  assert.equal(isSystemRoleRenameAttempt({ name: "Ученик", isSystem: true }, "Студент"), true);
});

test("isSystemRoleRenameAttempt: системная роль без смены имени → false", () => {
  assert.equal(isSystemRoleRenameAttempt({ name: "Ученик", isSystem: true }, "Ученик"), false);
});

test("isSystemRoleRenameAttempt: не системную роль переименовывать можно → false", () => {
  assert.equal(isSystemRoleRenameAttempt({ name: "Стажёр", isSystem: false }, "Практикант"), false);
});
