import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isCourseAssignmentActive,
  parseCourseAccessDateInput,
  resolveCourseAccessWindow,
  resolveEffectiveCourseAccessWindow,
  toCourseAccessDateInputValue,
} from "./course-access-window";

// Окно доступа к курсу: определяет, активен ли доступ ученика по срокам.
// Тесты детерминированы — «сейчас» всегда передаётся явно.

const NOW = new Date(2026, 5, 15, 12, 0, 0);
const PAST = new Date(2026, 0, 1);
const FUTURE = new Date(2027, 0, 1);

// ------------------------------------------------ активность одного назначения

test("isCourseAssignmentActive: бессрочный доступ активен", () => {
  assert.equal(isCourseAssignmentActive(null, NOW), true);
  assert.equal(isCourseAssignmentActive(undefined, NOW), true);
});

test("isCourseAssignmentActive: будущая дата активна, прошлая — нет", () => {
  assert.equal(isCourseAssignmentActive(FUTURE, NOW), true);
  assert.equal(isCourseAssignmentActive(PAST, NOW), false);
});

test("isCourseAssignmentActive: ровно текущий момент считается истёкшим", () => {
  assert.equal(isCourseAssignmentActive(NOW, NOW), false);
});

// ------------------------------------------------------------- окно доступа

test("resolveCourseAccessWindow: нет назначений → null", () => {
  assert.equal(resolveCourseAccessWindow([], NOW), null);
  assert.equal(resolveCourseAccessWindow([undefined], NOW), null, "undefined не считается назначением");
});

test("resolveCourseAccessWindow: бессрочное назначение активно и без срока", () => {
  const w = resolveCourseAccessWindow([null], NOW);
  assert.ok(w);
  assert.equal(w.isUnlimited, true);
  assert.equal(w.isActive, true);
  assert.equal(w.state, "active");
  assert.equal(w.expiresAt, null);
});

test("resolveCourseAccessWindow: будущий срок активен, прошлый истёк", () => {
  assert.equal(resolveCourseAccessWindow([FUTURE], NOW)?.state, "active");
  assert.equal(resolveCourseAccessWindow([PAST], NOW)?.state, "expired");
});

test("resolveCourseAccessWindow: undefined отфильтровывается, реальный срок остаётся", () => {
  const w = resolveCourseAccessWindow([undefined, FUTURE], NOW);
  assert.equal(w?.state, "active");
  assert.equal(w?.isUnlimited, false);
});

test("resolveEffectiveCourseAccessWindow: наследованный (групповой) срок учитывается", () => {
  // прямых назначений нет, но есть групповое с будущим сроком
  const w = resolveEffectiveCourseAccessWindow([], [FUTURE], NOW);
  assert.equal(w?.state, "active");
  // ни прямых, ни групповых → null
  assert.equal(resolveEffectiveCourseAccessWindow([], [], NOW), null);
});

// ----------------------------------------------------------- разбор даты ввода

test("parseCourseAccessDateInput: валидная дата → конец дня", () => {
  const d = parseCourseAccessDateInput("2026-03-15");
  assert.ok(d);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 15);
  // до конца суток — чтобы доступ не «истекал» в полночь того же дня
  assert.equal(d.getHours(), 23);
  assert.equal(d.getMinutes(), 59);
  assert.equal(d.getSeconds(), 59);
});

test("parseCourseAccessDateInput: неверный формат → null", () => {
  assert.equal(parseCourseAccessDateInput("2026/03/15"), null);
  assert.equal(parseCourseAccessDateInput("15.03.2026"), null);
  assert.equal(parseCourseAccessDateInput("2026-3-5"), null, "нужны ведущие нули");
  assert.equal(parseCourseAccessDateInput("abc"), null);
  assert.equal(parseCourseAccessDateInput(""), null);
});

test("parseCourseAccessDateInput: перекатывающуюся дату JS нормализует (документируем)", () => {
  // «2026-02-30» проходит формат-проверку, а конструктор Date переносит на март.
  const d = parseCourseAccessDateInput("2026-02-30");
  assert.ok(d, "формат валиден, поэтому не null");
  assert.equal(d.getMonth(), 2, "30 февраля → 2 марта");
  assert.equal(d.getDate(), 2);
});

// ------------------------------------------------------------- обратный формат

test("toCourseAccessDateInputValue: формат YYYY-MM-DD с ведущими нулями", () => {
  assert.equal(toCourseAccessDateInputValue(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(toCourseAccessDateInputValue(new Date(2026, 11, 31)), "2026-12-31");
});

test("parse/format образуют цикл по датам", () => {
  const value = "2026-07-09";
  const parsed = parseCourseAccessDateInput(value);
  assert.ok(parsed);
  assert.equal(toCourseAccessDateInputValue(parsed), value);
});
