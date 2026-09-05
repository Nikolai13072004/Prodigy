import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getCourseCreationMode,
  getCourseTemplateLabel,
  isCourseTemplateKey,
} from "./course-creation-options";

// Опции создания курса: режим и шаблон с безопасным откатом.

test("getCourseCreationMode: известные значения, иначе — presentation", () => {
  assert.equal(getCourseCreationMode("blank"), "blank");
  assert.equal(getCourseCreationMode("template"), "template");
  assert.equal(getCourseCreationMode("copy"), "copy");
  assert.equal(getCourseCreationMode("presentation"), "presentation");
  assert.equal(getCourseCreationMode("нечто"), "presentation", "неизвестное → дефолт");
  assert.equal(getCourseCreationMode(null), "presentation");
  assert.equal(getCourseCreationMode(undefined), "presentation");
});

test("isCourseTemplateKey распознаёт только известные шаблоны", () => {
  assert.equal(isCourseTemplateKey("three_step"), true);
  assert.equal(isCourseTemplateKey("presentation_with_quiz"), true);
  assert.equal(isCourseTemplateKey("required_training"), true);
  assert.equal(isCourseTemplateKey("нет"), false);
});

test("getCourseTemplateLabel: метка шаблона, для неизвестного — само значение", () => {
  assert.equal(getCourseTemplateLabel("three_step"), "Три модуля");
  // @ts-expect-error — намеренно неизвестный ключ: проверяем фолбэк на значение
  assert.equal(getCourseTemplateLabel("unknown"), "unknown");
});
