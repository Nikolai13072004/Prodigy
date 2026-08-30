import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUserActivationToken,
  DEFAULT_USER_ACTIVATION_TTL_DAYS,
  hashUserActivationToken,
  userActivationExpiresAt,
} from "./user-activations";

// Токены активации учётной записи: хэш sha256, случайный токен, срок жизни.

const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const DAY_MS = 24 * 60 * 60 * 1000;

test("hashUserActivationToken — детерминированный sha256 (эталон «abc»)", () => {
  assert.equal(hashUserActivationToken("abc"), SHA256_ABC);
});

test("createUserActivationToken: 48 hex-символов, хэш совпадает, токены уникальны", () => {
  const a = createUserActivationToken();
  assert.match(a.token, /^[0-9a-f]{48}$/);
  assert.equal(a.tokenHash, hashUserActivationToken(a.token));
  assert.notEqual(a.token, createUserActivationToken().token);
});

test("userActivationExpiresAt: срок по умолчанию 7 дней", () => {
  const from = new Date("2026-08-25T00:00:00Z");
  assert.equal(DEFAULT_USER_ACTIVATION_TTL_DAYS, 7);
  assert.equal(userActivationExpiresAt(undefined, from).getTime(), from.getTime() + 7 * DAY_MS);
  assert.equal(userActivationExpiresAt(1, from).getTime(), from.getTime() + DAY_MS);
});
