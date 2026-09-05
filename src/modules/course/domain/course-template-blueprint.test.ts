import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getCourseTemplateBlueprint,
  planTemplateCourseItems,
} from "./course-template-blueprint";

test("presentation_with_quiz: 2 модуля, PDF + QUIZ", () => {
  const bp = getCourseTemplateBlueprint("presentation_with_quiz");
  assert.equal(bp.modules.length, 2);
  assert.deepEqual(
    bp.items.map((i) => [i.moduleIndex, i.type]),
    [
      [0, "PDF"],
      [1, "QUIZ"],
    ],
  );
});

test("required_training: TEXT+PDF в модуле 0, QUIZ в модуле 1", () => {
  const bp = getCourseTemplateBlueprint("required_training");
  assert.equal(bp.modules.length, 2);
  assert.deepEqual(
    bp.items.map((i) => [i.moduleIndex, i.type]),
    [
      [0, "TEXT"],
      [0, "PDF"],
      [1, "QUIZ"],
    ],
  );
});

test("неизвестный ключ → дефолтный шаблон (3 модуля)", () => {
  const bp = getCourseTemplateBlueprint("что-то-другое" as never);
  assert.equal(bp.modules.length, 3);
  assert.equal(bp.items.length, 3);
});

test("planTemplateCourseItems: orderIndex по позиции, привязка к модулю, дефолты", () => {
  const moduleIds = ["m0", "m1"];
  const items = getCourseTemplateBlueprint("required_training").items;
  const specs = planTemplateCourseItems(moduleIds, items);

  assert.deepEqual(
    specs.map((s) => [s.orderIndex, s.moduleId, s.type, s.needsQuiz]),
    [
      [0, "m0", "TEXT", false],
      [1, "m0", "PDF", false],
      [2, "m1", "QUIZ", true],
    ],
  );
  // TEXT с заданным content сохраняется, не-TEXT → content null.
  assert.match(specs[0].content ?? "", /правила/);
  assert.equal(specs[1].content, null);
  assert.equal(specs.every((s) => s.isRequired), true);
});

test("planTemplateCourseItems: несуществующий moduleIndex → moduleId null; TEXT без content → дефолт", () => {
  const specs = planTemplateCourseItems([], [
    { moduleIndex: 5, type: "TEXT", title: "X" },
    { moduleIndex: 0, type: "VIDEO", title: "V", isRequired: false },
  ]);
  assert.equal(specs[0].moduleId, null);
  assert.match(specs[0].content ?? "", /Заполните содержание/);
  assert.equal(specs[1].isRequired, false);
  assert.equal(specs[1].needsQuiz, false);
});
