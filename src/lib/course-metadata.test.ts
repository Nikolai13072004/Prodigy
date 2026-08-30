import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCourseDuration,
  getCourseCategoryLabel,
  getCourseDifficultyLabel,
  isCourseCategory,
  isCourseDifficultyLevel,
  splitCourseDurationMinutes,
} from "./course-metadata";

// Категория, сложность и длительность курса — предикаты и форматирование.

test("isCourseCategory / isCourseDifficultyLevel распознают допустимые значения", () => {
  assert.equal(isCourseCategory("FINANCE"), true);
  assert.equal(isCourseCategory("ACCOUNTING"), true);
  assert.equal(isCourseCategory("НЕТ"), false);
  assert.equal(isCourseCategory(""), false);
  assert.equal(isCourseDifficultyLevel("BEGINNER"), true);
  assert.equal(isCourseDifficultyLevel("EXPERT"), false);
});

test("getCourseCategoryLabel: метка или «Не указана»", () => {
  assert.equal(getCourseCategoryLabel("FINANCE"), "Финансы");
  assert.equal(getCourseCategoryLabel("HR"), "HR");
  assert.equal(getCourseCategoryLabel(null), "Не указана");
  assert.equal(getCourseCategoryLabel(undefined), "Не указана");
  assert.equal(getCourseCategoryLabel("мусор"), "Не указана");
});

test("getCourseDifficultyLabel: метка или «Не указан»", () => {
  assert.equal(getCourseDifficultyLabel("BEGINNER"), "Начальный");
  assert.equal(getCourseDifficultyLabel("ADVANCED"), "Продвинутый");
  assert.equal(getCourseDifficultyLabel(null), "Не указан");
  assert.equal(getCourseDifficultyLabel("x"), "Не указан");
});

test("formatCourseDuration: часы и минуты", () => {
  assert.equal(formatCourseDuration(90), "1 ч 30 мин");
  assert.equal(formatCourseDuration(60), "1 ч");
  assert.equal(formatCourseDuration(45), "45 мин");
  assert.equal(formatCourseDuration(125), "2 ч 5 мин");
  assert.equal(formatCourseDuration(1), "1 мин");
});

test("formatCourseDuration: пусто/некорректно → «Не указана»", () => {
  assert.equal(formatCourseDuration(0), "Не указана");
  assert.equal(formatCourseDuration(null), "Не указана");
  assert.equal(formatCourseDuration(undefined), "Не указана");
  assert.equal(formatCourseDuration(-30), "Не указана");
  assert.equal(formatCourseDuration(45.5), "Не указана", "дробное не длительность");
});

test("splitCourseDurationMinutes: разбивка или дефолт {1,0}", () => {
  assert.deepEqual(splitCourseDurationMinutes(90), { hours: 1, minutes: 30 });
  assert.deepEqual(splitCourseDurationMinutes(60), { hours: 1, minutes: 0 });
  assert.deepEqual(splitCourseDurationMinutes(45), { hours: 0, minutes: 45 });
  assert.deepEqual(splitCourseDurationMinutes(null), { hours: 1, minutes: 0 });
  assert.deepEqual(splitCourseDurationMinutes(0), { hours: 1, minutes: 0 });
  assert.deepEqual(splitCourseDurationMinutes(-5), { hours: 1, minutes: 0 });
});
