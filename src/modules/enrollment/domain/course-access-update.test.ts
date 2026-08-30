import assert from "node:assert/strict";
import { test } from "node:test";
import { planCourseAccessExpiry } from "./course-access-update";

// Правило новой даты доступа по режиму.

const NOW = new Date("2026-08-25T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function active(expiresAt: Date | null) {
  return { expiresAt, isUnlimited: expiresAt === null };
}

test("нет окна доступа → пропуск NOT_ASSIGNED", () => {
  assert.deepEqual(
    planCourseAccessExpiry({ mode: "EXTEND", accessWindow: null, requestedExpiresAt: null, days: 30, now: NOW }),
    { action: "skip", reason: "NOT_ASSIGNED" }
  );
});

test("уже бессрочный → пропуск для UNLIMITED и EXTEND", () => {
  for (const mode of ["UNLIMITED", "EXTEND"]) {
    assert.deepEqual(
      planCourseAccessExpiry({ mode, accessWindow: active(null), requestedExpiresAt: null, days: 30, now: NOW }),
      { action: "skip", reason: "ALREADY_UNLIMITED" }
    );
  }
});

test("UNLIMITED → бессрочная дата (null)", () => {
  assert.deepEqual(
    planCourseAccessExpiry({
      mode: "UNLIMITED",
      accessWindow: active(new Date("2026-09-01T00:00:00Z")),
      requestedExpiresAt: null,
      days: 30,
      now: NOW,
    }),
    { action: "set", expiresAt: null }
  );
});

test("SET_DATE → указанная дата", () => {
  const target = new Date("2026-12-31T23:59:59Z");
  assert.deepEqual(
    planCourseAccessExpiry({
      mode: "SET_DATE",
      accessWindow: active(new Date("2026-09-01T00:00:00Z")),
      requestedExpiresAt: target,
      days: 30,
      now: NOW,
    }),
    { action: "set", expiresAt: target }
  );
});

test("EXTEND от будущей даты, если она позже now", () => {
  const future = new Date("2026-09-10T00:00:00Z");
  const result = planCourseAccessExpiry({
    mode: "EXTEND",
    accessWindow: active(future),
    requestedExpiresAt: null,
    days: 10,
    now: NOW,
  });
  assert.deepEqual(result, { action: "set", expiresAt: new Date(future.getTime() + 10 * DAY) });
});

test("EXTEND от now, если доступ истёк", () => {
  const past = new Date("2026-08-01T00:00:00Z");
  const result = planCourseAccessExpiry({
    mode: "EXTEND",
    accessWindow: active(past),
    requestedExpiresAt: null,
    days: 7,
    now: NOW,
  });
  assert.deepEqual(result, { action: "set", expiresAt: new Date(NOW.getTime() + 7 * DAY) });
});
