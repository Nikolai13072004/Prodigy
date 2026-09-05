import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeSurveyQuestionType,
  planSurveyAnswers,
  type SurveyQuestionInput,
} from "./survey-answers";

const parseOptions = (optionsJson: string | null): string[] =>
  optionsJson ? (JSON.parse(optionsJson) as string[]) : [];

function question(overrides: Partial<SurveyQuestionInput> & { id: string; type: string }): SurveyQuestionInput {
  return { title: `Q ${overrides.id}`, isRequired: false, optionsJson: null, ...overrides };
}

test("RATING_5: валидное значение принимается, вне 1–5 и нечисло → null", () => {
  const questions = [
    question({ id: "a", type: "RATING_5" }),
    question({ id: "b", type: "RATING_5" }),
    question({ id: "c", type: "RATING_5" }),
  ];
  const raw: Record<string, string> = { a: "5", b: "9", c: "" };
  const result = planSurveyAnswers(questions, (id) => raw[id] ?? "", parseOptions);

  assert.ok(result.ok);
  assert.deepEqual(
    result.answers,
    [
      { questionId: "a", ratingValue: 5, textValue: null },
      { questionId: "b", ratingValue: null, textValue: null },
      { questionId: "c", ratingValue: null, textValue: null },
    ],
  );
});

test("обязательный RATING_5 без валидного значения → ok:false с заголовком вопроса", () => {
  const questions = [question({ id: "a", type: "RATING_5", title: "Оцените курс", isRequired: true })];
  const result = planSurveyAnswers(questions, () => "0", parseOptions);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.missingQuestionTitle, "Оцените курс");
});

test("SINGLE_CHOICE: выбор принимается только если он среди опций", () => {
  const questions = [
    question({ id: "a", type: "SINGLE_CHOICE", optionsJson: JSON.stringify(["Да", "Нет"]) }),
    question({ id: "b", type: "SINGLE_CHOICE", optionsJson: JSON.stringify(["Да", "Нет"]) }),
  ];
  const raw: Record<string, string> = { a: "Да", b: "Возможно" };
  const result = planSurveyAnswers(questions, (id) => raw[id] ?? "", parseOptions);

  assert.ok(result.ok);
  assert.equal(result.answers[0].textValue, "Да");
  assert.equal(result.answers[1].textValue, null, "чужой вариант отбрасывается");
});

test("обязательный SINGLE_CHOICE без валидного выбора → ok:false", () => {
  const questions = [
    question({ id: "a", type: "SINGLE_CHOICE", title: "Выберите", isRequired: true, optionsJson: JSON.stringify(["Да"]) }),
  ];
  const result = planSurveyAnswers(questions, () => "Нет", parseOptions);
  assert.equal(result.ok, false);
});

test("TEXT: пустой необязательный → null; обязательный пустой → ok:false", () => {
  const ok = planSurveyAnswers([question({ id: "a", type: "TEXT" })], () => "  ".trim(), parseOptions);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.answers[0].textValue, null);

  const bad = planSurveyAnswers(
    [question({ id: "a", type: "TEXT", title: "Комментарий", isRequired: true })],
    () => "",
    parseOptions,
  );
  assert.equal(bad.ok, false);
});

test("первый незаполненный обязательный вопрос определяет ошибку (порядок сохранён)", () => {
  const questions = [
    question({ id: "a", type: "TEXT", title: "Первый", isRequired: false }),
    question({ id: "b", type: "RATING_5", title: "Второй", isRequired: true }),
    question({ id: "c", type: "TEXT", title: "Третий", isRequired: true }),
  ];
  const result = planSurveyAnswers(questions, () => "", parseOptions);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.missingQuestionTitle, "Второй");
});

test("reportAnswers: рейтинг как строка, текст как есть, тип нормализован", () => {
  const questions = [
    question({ id: "a", type: "RATING_5", title: "Оценка" }),
    question({ id: "b", type: "SINGLE_CHOICE", title: "Выбор", optionsJson: JSON.stringify(["X"]) }),
    question({ id: "c", type: "WEIRD", title: "Прочее" }),
  ];
  const raw: Record<string, string> = { a: "4", b: "X", c: "текст" };
  const result = planSurveyAnswers(questions, (id) => raw[id] ?? "", parseOptions);

  assert.ok(result.ok);
  assert.deepEqual(result.reportAnswers, [
    { questionTitle: "Оценка", questionType: "RATING_5", answerText: "4" },
    { questionTitle: "Выбор", questionType: "SINGLE_CHOICE", answerText: "X" },
    { questionTitle: "Прочее", questionType: "TEXT", answerText: "текст" },
  ]);
});

test("normalizeSurveyQuestionType: неизвестный тип → TEXT", () => {
  assert.equal(normalizeSurveyQuestionType("RATING_5"), "RATING_5");
  assert.equal(normalizeSurveyQuestionType("SINGLE_CHOICE"), "SINGLE_CHOICE");
  assert.equal(normalizeSurveyQuestionType("anything"), "TEXT");
});
