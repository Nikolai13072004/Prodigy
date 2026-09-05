import assert from "node:assert/strict";
import { test } from "node:test";
import type { CourseAccessWindow } from "./course-access-window";
import { formatCourseDeadlineDate, getCourseDeadlineMeta } from "./course-deadline";

// Человекочитаемый дедлайн курса: заголовок, тон и признаки по окну доступа.
// «Сейчас» всегда передаётся явно для детерминизма.

const NOW = new Date(2026, 7, 24, 12, 0, 0); // 24.08.2026, 12:00
const DAY = 24 * 60 * 60 * 1000;

function win(overrides: Partial<CourseAccessWindow>): CourseAccessWindow {
  return { expiresAt: null, isUnlimited: false, isActive: true, state: "active", ...overrides };
}

// в N суток от NOW (ровно кратно суткам → ceil даёт целое N)
function inDays(n: number): Date {
  return new Date(NOW.getTime() + n * DAY);
}

test("нет окна / бессрочный доступ → без дедлайна", () => {
  for (const w of [
    null,
    win({ isUnlimited: true }),
    win({ expiresAt: null }),
  ]) {
    const meta = getCourseDeadlineMeta(w, false, NOW);
    assert.equal(meta.title, "Без дедлайна");
    assert.equal(meta.tone, "neutral");
    assert.equal(meta.isUnlimited, true);
    assert.equal(meta.isExpired, false);
  }
});

test("истёкший доступ, курс не завершён → «Просрочено», тон danger", () => {
  const meta = getCourseDeadlineMeta(
    win({ expiresAt: inDays(-3), isActive: false, state: "expired" }),
    false,
    NOW,
  );
  assert.equal(meta.title, "Просрочено с 21.08.2026");
  assert.equal(meta.tone, "danger");
  assert.equal(meta.isExpired, true);
});

test("истёкший доступ, курс завершён → нейтральная отметка без danger", () => {
  const meta = getCourseDeadlineMeta(
    win({ expiresAt: inDays(-3), isActive: false, state: "expired" }),
    true,
    NOW,
  );
  assert.equal(meta.title, "Доступ истек 21.08.2026");
  assert.equal(meta.tone, "neutral");
  assert.equal(meta.isExpired, true);
});

test("активный доступ, курс завершён → тон success и компактная метка «Доступ до»", () => {
  const meta = getCourseDeadlineMeta(win({ expiresAt: inDays(10) }), true, NOW);
  assert.equal(meta.title, "Доступ истекает 03.09.2026");
  assert.equal(meta.compactLabel, "Доступ до 03.09.2026");
  assert.equal(meta.tone, "success");
  assert.equal(meta.isExpired, false);
});

test("активный, не завершён, до дедлайна > 7 дней → тон info", () => {
  const meta = getCourseDeadlineMeta(win({ expiresAt: inDays(10) }), false, NOW);
  assert.equal(meta.title, "Завершить до 03.09.2026");
  assert.equal(meta.tone, "info");
  assert.match(meta.description, /осталось 10 дней/);
});

test("активный, не завершён, до дедлайна ≤ 7 дней → тон warning", () => {
  const meta = getCourseDeadlineMeta(win({ expiresAt: inDays(3) }), false, NOW);
  assert.equal(meta.tone, "warning");
  assert.match(meta.description, /осталось 3 дня/);
});

test("дедлайн сегодня → «срок истекает сегодня»", () => {
  const meta = getCourseDeadlineMeta(win({ expiresAt: new Date(NOW) }), false, NOW);
  assert.match(meta.description, /срок истекает сегодня/);
  assert.equal(meta.tone, "warning");
});

test("русское склонение «день/дня/дней» по числу оставшихся суток", () => {
  const cases: Array<[number, string]> = [
    [1, "1 день"],
    [2, "2 дня"],
    [5, "5 дней"],
    [11, "11 дней"],
    [21, "21 день"],
    [22, "22 дня"],
  ];
  for (const [days, expected] of cases) {
    const meta = getCourseDeadlineMeta(win({ expiresAt: inDays(days) }), false, NOW);
    assert.match(meta.description, new RegExp(`осталось ${expected}`), `для ${days} суток`);
  }
});

test("formatCourseDeadlineDate: формат ДД.ММ.ГГГГ с ведущими нулями", () => {
  assert.equal(formatCourseDeadlineDate(new Date(2026, 0, 5)), "05.01.2026");
  assert.equal(formatCourseDeadlineDate(new Date(2026, 11, 31)), "31.12.2026");
});
