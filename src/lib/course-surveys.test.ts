import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCourseSurveyTitle,
  getDefaultCourseSurveyQuestions,
  isCourseSurveyQuestionType,
  parseCourseSurveyQuestionOptionsJson,
  parseCourseSurveyQuestionsJson,
  serializeCourseSurveyQuestionOptions,
} from "./course-surveys";

// Опрос после курса: заголовок, дефолтные вопросы и устойчивый разбор JSON из БД.

test("formatCourseSurveyTitle: обрезка, пустой и легаси-заголовок → дефолт", () => {
  assert.equal(formatCourseSurveyTitle("  Мой опрос  "), "Мой опрос");
  assert.equal(formatCourseSurveyTitle(""), "Опрос после курса");
  assert.equal(formatCourseSurveyTitle(null), "Опрос после курса");
  assert.equal(formatCourseSurveyTitle("Анкета после курса"), "Опрос после курса", "легаси-название заменяется");
});

test("getDefaultCourseSurveyQuestions: 4 вопроса, id пустые", () => {
  const questions = getDefaultCourseSurveyQuestions();
  assert.equal(questions.length, 4);
  assert.ok(questions.every((q) => q.id === null));
  assert.equal(questions[0].type, "RATING_5");
  assert.equal(questions[0].isRequired, true);
  assert.equal(questions[3].type, "TEXT");
  assert.equal(questions[3].isRequired, false);
});

test("isCourseSurveyQuestionType", () => {
  assert.equal(isCourseSurveyQuestionType("RATING_5"), true);
  assert.equal(isCourseSurveyQuestionType("SINGLE_CHOICE"), true);
  assert.equal(isCourseSurveyQuestionType("TEXT"), true);
  assert.equal(isCourseSurveyQuestionType("OTHER"), false);
});

// ---------------------------------------- parseCourseSurveyQuestionsJson

test("пустой/не массив/битый JSON → дефолтные вопросы", () => {
  assert.equal(parseCourseSurveyQuestionsJson("").length, 4);
  assert.equal(parseCourseSurveyQuestionsJson("   ").length, 4);
  assert.equal(parseCourseSurveyQuestionsJson("{}").length, 4, "объект, не массив");
  assert.equal(parseCourseSurveyQuestionsJson("битый").length, 4);
});

test("валидный массив нормализуется; неизвестный тип → TEXT; id сохраняется", () => {
  const json = JSON.stringify([
    { id: " q1 ", title: "  Как оценки?  ", type: "RATING_5", isRequired: true },
    { title: "Комментарий", type: "НЕИЗВЕСТНО" },
  ]);
  const result = parseCourseSurveyQuestionsJson(json);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { id: "q1", title: "Как оценки?", type: "RATING_5", isRequired: true, options: [] });
  assert.equal(result[1].type, "TEXT", "неизвестный тип приводится к TEXT");
  assert.equal(result[1].isRequired, false);
});

test("SINGLE_CHOICE: <2 вариантов отбрасывается, иначе варианты дедуплицируются", () => {
  const dropped = parseCourseSurveyQuestionsJson(
    JSON.stringify([{ title: "Один вариант", type: "SINGLE_CHOICE", options: ["A"] }]),
  );
  assert.deepEqual(dropped, [], "нужно минимум 2 варианта");

  const kept = parseCourseSurveyQuestionsJson(
    JSON.stringify([{ title: "Выбор", type: "SINGLE_CHOICE", options: ["A", "A", " B "] }]),
  );
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0].options, ["A", "B"], "дубли и пробелы убраны");
});

test("вопросы без заголовка отбрасываются; полностью пустой набор → [] (не дефолт)", () => {
  assert.deepEqual(parseCourseSurveyQuestionsJson(JSON.stringify([{ title: "" }, { foo: 1 }])), []);
});

test("не более 20 вопросов", () => {
  const many = Array.from({ length: 25 }, (_unused, index) => ({ title: `Вопрос ${index}`, type: "TEXT" }));
  assert.equal(parseCourseSurveyQuestionsJson(JSON.stringify(many)).length, 20);
});

// ---------------------------------------- варианты ответа: parse / serialize

test("parseCourseSurveyQuestionOptionsJson: разбор, дедуп, устойчивость", () => {
  assert.deepEqual(parseCourseSurveyQuestionOptionsJson('["A","A"," B ",""]'), ["A", "B"]);
  assert.deepEqual(parseCourseSurveyQuestionOptionsJson(null), []);
  assert.deepEqual(parseCourseSurveyQuestionOptionsJson(""), []);
  assert.deepEqual(parseCourseSurveyQuestionOptionsJson("битый"), []);
  assert.deepEqual(parseCourseSurveyQuestionOptionsJson('{"a":1}'), [], "не массив");
});

test("serializeCourseSurveyQuestionOptions: дедуп; пусто → null", () => {
  assert.equal(serializeCourseSurveyQuestionOptions(["A", " A ", "B"]), JSON.stringify(["A", "B"]));
  assert.equal(serializeCourseSurveyQuestionOptions([]), null);
  assert.equal(serializeCourseSurveyQuestionOptions(["", "   "]), null);
});
