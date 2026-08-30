import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTimeLimit, isAssessmentTimeLimitExpired } from "./assessment";

const at = (iso: string) => new Date(iso);

test("нет попытки или нет лимита → не истёк", () => {
  assert.equal(
    isAssessmentTimeLimitExpired({ attempt: null, timeLimitMinutes: 30, now: at("2026-01-01T00:00:00Z") }),
    false,
  );
  assert.equal(
    isAssessmentTimeLimitExpired({
      attempt: { createdAt: at("2026-01-01T00:00:00Z") },
      timeLimitMinutes: null,
      now: at("2026-01-01T02:00:00Z"),
    }),
    false,
  );
});

test("в пределах лимита → не истёк; за пределом → истёк", () => {
  const attempt = { createdAt: at("2026-01-01T00:00:00Z") };
  assert.equal(
    isAssessmentTimeLimitExpired({ attempt, timeLimitMinutes: 30, now: at("2026-01-01T00:29:59Z") }),
    false,
  );
  assert.equal(
    isAssessmentTimeLimitExpired({ attempt, timeLimitMinutes: 30, now: at("2026-01-01T00:30:01Z") }),
    true,
  );
});

test("submissionGraceMs расширяет окно", () => {
  const attempt = { createdAt: at("2026-01-01T00:00:00Z") };
  // 5 секунд после лимита, но грейс 10с — ещё не истёк.
  assert.equal(
    isAssessmentTimeLimitExpired({
      attempt,
      timeLimitMinutes: 30,
      now: at("2026-01-01T00:30:05Z"),
      submissionGraceMs: 10_000,
    }),
    false,
  );
});

test("assertTimeLimit бросает ровно когда предикат истинен", () => {
  const attempt = { createdAt: at("2026-01-01T00:00:00Z") };
  assert.doesNotThrow(() =>
    assertTimeLimit({ attempt, timeLimitMinutes: 30, now: at("2026-01-01T00:10:00Z") }),
  );
  assert.throws(
    () => assertTimeLimit({ attempt, timeLimitMinutes: 30, now: at("2026-01-01T01:00:00Z") }),
    /Время прохождения теста истекло/,
  );
});
