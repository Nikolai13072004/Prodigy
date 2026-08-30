import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPasswordResetToken,
  DEFAULT_PASSWORD_RESET_TTL_MINUTES,
  hashPasswordResetToken,
  passwordResetExpiresAt,
  passwordResetTtlLabel,
} from "./password-resets";

// Токены сброса пароля: хэш sha256, случайный токен, срок жизни и его подпись.

const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const MIN_MS = 60 * 1000;

test("hashPasswordResetToken — детерминированный sha256 (эталон «abc»)", () => {
  assert.equal(hashPasswordResetToken("abc"), SHA256_ABC);
});

test("createPasswordResetToken: 48 hex-символов, хэш совпадает, токены уникальны", () => {
  const a = createPasswordResetToken();
  assert.match(a.token, /^[0-9a-f]{48}$/);
  assert.equal(a.tokenHash, hashPasswordResetToken(a.token));
  assert.notEqual(a.token, createPasswordResetToken().token);
});

test("passwordResetExpiresAt: срок по умолчанию 60 минут", () => {
  const from = new Date("2026-08-25T12:00:00Z");
  assert.equal(DEFAULT_PASSWORD_RESET_TTL_MINUTES, 60);
  assert.equal(passwordResetExpiresAt(undefined, from).getTime(), from.getTime() + 60 * MIN_MS);
  assert.equal(passwordResetExpiresAt(15, from).getTime(), from.getTime() + 15 * MIN_MS);
});

test("passwordResetTtlLabel: русское склонение часов и минут", () => {
  assert.equal(passwordResetTtlLabel(60), "1 час");
  assert.equal(passwordResetTtlLabel(120), "2 часа");
  assert.equal(passwordResetTtlLabel(240), "4 часа");
  assert.equal(passwordResetTtlLabel(300), "5 часов");
  assert.equal(passwordResetTtlLabel(1), "1 минуту");
  assert.equal(passwordResetTtlLabel(3), "3 минуты");
  assert.equal(passwordResetTtlLabel(30), "30 минут");
  assert.equal(passwordResetTtlLabel(90), "90 минут", "не кратно часу → минуты");
});
