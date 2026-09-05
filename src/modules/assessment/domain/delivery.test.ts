import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssessmentQuestion } from "./assessment";
import {
  getAssessmentRetryAvailableAt,
  getEffectiveQuestionCount,
  prepareAssessmentQuestions,
} from "./delivery";

// Подготовка вопросов к прохождению: размер выборки, перемешивание (с
// инжектируемым random для детерминизма), сохранение верного ответа, задержка ретрая.

function question(id: string, config = "{}"): AssessmentQuestion {
  return { id, orderIndex: 0, type: "OPEN", prompt: id, config, points: 1 };
}

// -------------------------------------------------- getEffectiveQuestionCount

test("getEffectiveQuestionCount: клампит выборку в [1, total], пустой пул → total", () => {
  assert.equal(getEffectiveQuestionCount(0), 0, "нет вопросов");
  assert.equal(getEffectiveQuestionCount(5), 5, "пул не задан");
  assert.equal(getEffectiveQuestionCount(5, 0), 5, "пул < 1 → весь набор");
  assert.equal(getEffectiveQuestionCount(5, -3), 5);
  assert.equal(getEffectiveQuestionCount(5, 3), 3);
  assert.equal(getEffectiveQuestionCount(5, 10), 5, "пул больше набора → весь набор");
  assert.equal(getEffectiveQuestionCount(5, 1), 1);
});

// -------------------------------------------------- prepareAssessmentQuestions

test("без перемешивания порядок сохраняется, orderIndex переиндексируется", () => {
  const questions = [question("a"), question("b"), question("c")];
  const result = prepareAssessmentQuestions(questions, { shuffleAnswers: false, shuffleQuestions: false });
  assert.deepEqual(result.map((q) => q.id), ["a", "b", "c"]);
  assert.deepEqual(result.map((q) => q.orderIndex), [0, 1, 2]);
  assert.equal(result[0].config, "{}", "config не тронут");
});

test("пул меньше набора → усечение до размера пула, orderIndex подряд", () => {
  const questions = [question("a"), question("b"), question("c"), question("d"), question("e")];
  const result = prepareAssessmentQuestions(questions, {
    shuffleAnswers: false,
    shuffleQuestions: false,
    questionPoolSize: 2,
    random: () => 0,
  });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((q) => q.orderIndex), [0, 1]);
  const ids = new Set(["a", "b", "c", "d", "e"]);
  assert.ok(result.every((q) => ids.has(q.id)), "вопросы из исходного набора");
});

test("перемешивание вопросов сохраняет весь набор (перестановка)", () => {
  const questions = [question("a"), question("b"), question("c"), question("d")];
  const result = prepareAssessmentQuestions(questions, {
    shuffleAnswers: false,
    shuffleQuestions: true,
    random: () => 0,
  });
  assert.deepEqual(result.map((q) => q.id).sort(), ["a", "b", "c", "d"], "тот же набор");
  assert.deepEqual(result.map((q) => q.orderIndex), [0, 1, 2, 3]);
});

test("перемешивание ответов SINGLE_CHOICE сохраняет верный вариант", () => {
  const single = question("q1", JSON.stringify({ options: ["A", "B", "C", "D"], correctIndex: 2 }));
  const [prepared] = prepareAssessmentQuestions([single], {
    shuffleAnswers: true,
    shuffleQuestions: false,
    random: () => 0,
  });
  const config = JSON.parse(prepared.config) as { options: string[]; correctIndex: number };
  assert.deepEqual([...config.options].sort(), ["A", "B", "C", "D"], "варианты — перестановка");
  assert.equal(config.options[config.correctIndex], "C", "correctIndex по-прежнему указывает на верный ответ");
});

// -------------------------------------------------- getAssessmentRetryAvailableAt

test("getAssessmentRetryAvailableAt: последний провал + задержка", () => {
  const attempts = [
    { outcome: "FAILED", completedAt: new Date("2026-08-20T10:00:00Z") },
    { outcome: "FAILED", completedAt: new Date("2026-08-20T12:00:00Z") }, // последний
    { outcome: "PASSED", completedAt: new Date("2026-08-20T09:00:00Z") },
  ];
  const availableAt = getAssessmentRetryAvailableAt(attempts, 30);
  assert.deepEqual(availableAt, new Date("2026-08-20T12:30:00Z"));
});

test("getAssessmentRetryAvailableAt: без задержки или без провалов → null", () => {
  const failed = [{ outcome: "FAILED", completedAt: new Date("2026-08-20T12:00:00Z") }];
  assert.equal(getAssessmentRetryAvailableAt(failed, 0), null, "нет задержки");
  assert.equal(getAssessmentRetryAvailableAt(failed, null), null);
  assert.equal(
    getAssessmentRetryAvailableAt([{ outcome: "PASSED", completedAt: new Date() }], 30),
    null,
    "нет провалов",
  );
});
