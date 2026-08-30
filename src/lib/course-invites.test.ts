import assert from "node:assert/strict";
import { test } from "node:test";
import {
  courseInviteExpiresAt,
  createCourseInviteToken,
  DEFAULT_COURSE_INVITE_TTL_DAYS,
  hashCourseInviteToken,
} from "./course-invites";

// Токены приглашения на курс: хэш sha256, случайный токен, срок жизни.

const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const DAY_MS = 24 * 60 * 60 * 1000;

test("hashCourseInviteToken — детерминированный sha256 (эталон «abc»)", () => {
  assert.equal(hashCourseInviteToken("abc"), SHA256_ABC);
  assert.match(hashCourseInviteToken("любой"), /^[0-9a-f]{64}$/);
});

test("createCourseInviteToken: 48 hex-символов, хэш совпадает, токены уникальны", () => {
  const a = createCourseInviteToken();
  assert.match(a.token, /^[0-9a-f]{48}$/, "24 байта в hex");
  assert.equal(a.tokenHash, hashCourseInviteToken(a.token));
  assert.notEqual(a.token, createCourseInviteToken().token, "случайность");
});

test("courseInviteExpiresAt: срок по умолчанию 7 дней от указанного момента", () => {
  const from = new Date("2026-08-25T00:00:00Z");
  assert.equal(DEFAULT_COURSE_INVITE_TTL_DAYS, 7);
  assert.equal(courseInviteExpiresAt(undefined, from).getTime(), from.getTime() + 7 * DAY_MS);
  assert.equal(courseInviteExpiresAt(3, from).getTime(), from.getTime() + 3 * DAY_MS);
});
