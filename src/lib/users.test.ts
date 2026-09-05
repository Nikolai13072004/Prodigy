import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUserDisplayName,
  isAccessRevokedUserStatus,
  isEditableUserStatus,
  isUserStatus,
} from "./users";

// Статусы пользователя и построение отображаемого имени.

test("isUserStatus: только известные статусы, регистр важен", () => {
  for (const status of ["ACTIVE", "PENDING", "BLOCKED", "ARCHIVED"]) {
    assert.equal(isUserStatus(status), true, status);
  }
  assert.equal(isUserStatus("active"), false, "регистр важен");
  assert.equal(isUserStatus("UNKNOWN"), false);
  assert.equal(isUserStatus(""), false);
});

test("isEditableUserStatus: всё кроме ARCHIVED", () => {
  assert.equal(isEditableUserStatus("ACTIVE"), true);
  assert.equal(isEditableUserStatus("PENDING"), true);
  assert.equal(isEditableUserStatus("BLOCKED"), true);
  assert.equal(isEditableUserStatus("ARCHIVED"), false);
});

test("isAccessRevokedUserStatus: доступ закрыт при BLOCKED и ARCHIVED", () => {
  assert.equal(isAccessRevokedUserStatus("BLOCKED"), true);
  assert.equal(isAccessRevokedUserStatus("ARCHIVED"), true);
  assert.equal(isAccessRevokedUserStatus("ACTIVE"), false);
  assert.equal(isAccessRevokedUserStatus("PENDING"), false);
});

test("buildUserDisplayName: обрезает пробелы, опускает пустую фамилию", () => {
  assert.equal(buildUserDisplayName("  Иван ", " Петров "), "Иван Петров");
  assert.equal(buildUserDisplayName("Иван", null), "Иван");
  assert.equal(buildUserDisplayName("Иван", undefined), "Иван");
  assert.equal(buildUserDisplayName("Иван", "   "), "Иван", "пустая фамилия отбрасывается");
  assert.equal(buildUserDisplayName("   ", "Петров"), "Петров", "только фамилия");
  assert.equal(buildUserDisplayName("   ", null), "");
});
