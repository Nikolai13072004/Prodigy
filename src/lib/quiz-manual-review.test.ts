import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildManualReviewOutcome,
  getManualReviewQuestions,
  isManualReviewQuestion,
  parseAttemptAnswers,
  parseFileAnswer,
  parseManualReviewData,
  parseQuestionConfig,
  parseQuestionSnapshot,
  type QuizQuestionSnapshot,
} from "./quiz-manual-review";

// Разбор попыток тестов и ручная проверка. Парсеры устойчивы к битым данным
// из БД (JSON-поля), parseFileAnswer дополнительно ограничивает URL вложения.

function fileQuestion(id: string, points: number, orderIndex = 0): QuizQuestionSnapshot {
  return { id, orderIndex, type: "FILE", prompt: "Прикрепите файл", config: "{}", points };
}

// ---------------------------------------------------- parseFileAnswer (безопасность)

test("parseFileAnswer принимает только вложение из quiz-attachments", () => {
  const ok = JSON.stringify({ url: "/uploads/quiz-attachments/a.pdf", fileName: "a.pdf", size: 10 });
  assert.deepEqual(parseFileAnswer(ok), {
    url: "/uploads/quiz-attachments/a.pdf",
    fileName: "a.pdf",
    size: 10,
  });
});

test("parseFileAnswer отвергает чужой префикс URL", () => {
  for (const url of [
    "/uploads/user-avatars/a.png",
    "/etc/passwd",
    "https://зло.test/a.pdf",
    "//зло.test/a.pdf",
    "/uploads/quiz-attachments", // без завершающего слэша — не префикс каталога
  ]) {
    const raw = JSON.stringify({ url, fileName: "a", size: 5 });
    assert.equal(parseFileAnswer(raw), null, `пропущен опасный url: ${url}`);
  }
});

test("parseFileAnswer отвергает пустое имя и неверный размер", () => {
  const base = { url: "/uploads/quiz-attachments/a.pdf", fileName: "a.pdf", size: 5 };
  assert.equal(parseFileAnswer(JSON.stringify({ ...base, fileName: "" })), null);
  assert.equal(parseFileAnswer(JSON.stringify({ ...base, fileName: "   " })), null);
  assert.equal(parseFileAnswer(JSON.stringify({ ...base, size: 0 })), null);
  assert.equal(parseFileAnswer(JSON.stringify({ ...base, size: -3 })), null);
  assert.equal(parseFileAnswer(JSON.stringify({ ...base, size: "5" })), null);
});

test("parseFileAnswer устойчив к не-строке и битому JSON", () => {
  assert.equal(parseFileAnswer(null), null);
  assert.equal(parseFileAnswer(42), null);
  assert.equal(parseFileAnswer(""), null);
  assert.equal(parseFileAnswer("{не json"), null);
});

// ------------------------------------------------------- parseQuestionSnapshot

test("parseQuestionSnapshot сортирует по orderIndex и отбрасывает битые", () => {
  const raw = JSON.stringify([
    { id: "b", orderIndex: 2, type: "SINGLE_CHOICE", prompt: "?", config: "{}", points: 1 },
    { id: "a", orderIndex: 1, type: "SINGLE_CHOICE", prompt: "?", config: "{}", points: 1 },
    { id: "нет-полей" },
    null,
    { id: "c", orderIndex: 3, type: "OPEN", prompt: "?", config: "{}", points: 2 },
  ]);
  const result = parseQuestionSnapshot(raw);
  assert.deepEqual(result.map((q) => q.id), ["a", "b", "c"]);
});

test("parseQuestionSnapshot: пусто/не массив/битый JSON → []", () => {
  assert.deepEqual(parseQuestionSnapshot(null), []);
  assert.deepEqual(parseQuestionSnapshot(""), []);
  assert.deepEqual(parseQuestionSnapshot('{"id":"x"}'), []);
  assert.deepEqual(parseQuestionSnapshot("{битый"), []);
});

// --------------------------------------------------------- parseAttemptAnswers

test("parseAttemptAnswers возвращает объект, а на мусор — {}", () => {
  assert.deepEqual(parseAttemptAnswers('{"q1":"ответ"}'), { q1: "ответ" });
  assert.deepEqual(parseAttemptAnswers("[1,2,3]"), {}, "массив не ответы");
  assert.deepEqual(parseAttemptAnswers("битый"), {});
  assert.deepEqual(parseAttemptAnswers(null), {});
});

// --------------------------------------------------------- parseManualReviewData

test("parseManualReviewData валидирует записи оценок", () => {
  const raw = JSON.stringify({
    q1: { awardedPoints: 3, accepted: true },
    q2: { awardedPoints: "2", accepted: false }, // строка приводится к числу
    q3: { awardedPoints: 5 }, // нет accepted → отбрасывается
    q4: { accepted: true }, // нет awardedPoints → NaN → отбрасывается
    q5: "не объект",
  });
  assert.deepEqual(parseManualReviewData(raw), {
    q1: { awardedPoints: 3, accepted: true },
    q2: { awardedPoints: 2, accepted: false },
  });
});

test("parseManualReviewData: мусор → {}", () => {
  assert.deepEqual(parseManualReviewData("[1]"), {});
  assert.deepEqual(parseManualReviewData("битый"), {});
  assert.deepEqual(parseManualReviewData(null), {});
});

// ----------------------------------------------------------- parseQuestionConfig

test("parseQuestionConfig отдаёт fallback на битом JSON", () => {
  assert.deepEqual(parseQuestionConfig('{"reviewMode":"MANUAL"}', { reviewMode: "AUTO" }), {
    reviewMode: "MANUAL",
  });
  assert.deepEqual(parseQuestionConfig("битый", { reviewMode: "AUTO" }), { reviewMode: "AUTO" });
});

// -------------------------------------------------------- isManualReviewQuestion

test("isManualReviewQuestion: FILE всегда ручной, OPEN — по reviewMode", () => {
  assert.equal(isManualReviewQuestion({ type: "FILE", config: "{}" }), true);
  assert.equal(isManualReviewQuestion({ type: "OPEN", config: '{"reviewMode":"MANUAL"}' }), true);
  assert.equal(isManualReviewQuestion({ type: "OPEN", config: '{"reviewMode":"AUTO"}' }), false);
  assert.equal(isManualReviewQuestion({ type: "OPEN", config: "{}" }), false, "по умолчанию AUTO");
  assert.equal(isManualReviewQuestion({ type: "SINGLE_CHOICE", config: "{}" }), false);
});

// ------------------------------------------------------- getManualReviewQuestions

test("getManualReviewQuestions выбирает только ручные вопросы и связывает ответ/оценку", () => {
  const snapshot: QuizQuestionSnapshot[] = [
    { id: "s", orderIndex: 0, type: "SINGLE_CHOICE", prompt: "?", config: "{}", points: 1 },
    fileQuestion("f", 5, 1),
  ];
  const answers = {
    f: JSON.stringify({ url: "/uploads/quiz-attachments/x.pdf", fileName: "x.pdf", size: 9 }),
  };
  const result = getManualReviewQuestions(snapshot, answers, { f: { awardedPoints: 4, accepted: true } });
  assert.equal(result.length, 1);
  assert.equal(result[0].question.id, "f");
  assert.equal(result[0].fileAnswer?.fileName, "x.pdf");
  assert.deepEqual(result[0].review, { awardedPoints: 4, accepted: true });
});

// -------------------------------------------------------- buildManualReviewOutcome

test("buildManualReviewOutcome требует оценку каждого ручного вопроса", () => {
  const snapshot = [fileQuestion("f", 5)];
  assert.throws(
    () => buildManualReviewOutcome({ snapshot, answers: {}, reviewData: {}, minCorrectAnswers: 1 }),
    /Не заполнена оценка/
  );
});

test("buildManualReviewOutcome добавляет ручные баллы с обрезкой по диапазону", () => {
  const snapshot = [fileQuestion("f", 5)];
  const answers = {};
  // awardedPoints выше максимума и дробный → clamp к points=5 после round
  const outcome = buildManualReviewOutcome({
    snapshot,
    answers,
    reviewData: { f: { awardedPoints: 9.6, accepted: true } },
    minCorrectAnswers: 1,
  });
  assert.equal(outcome.score, 5, "начислено не больше points вопроса");
  assert.equal(outcome.correctAnswers, 1, "accepted засчитан как верный");
  assert.equal(outcome.outcome, "PASSED");
});

test("buildManualReviewOutcome: отклонённый ручной ответ не проходит порог", () => {
  const snapshot = [fileQuestion("f", 5)];
  const outcome = buildManualReviewOutcome({
    snapshot,
    answers: {},
    reviewData: { f: { awardedPoints: -3, accepted: false } },
    minCorrectAnswers: 1,
  });
  assert.equal(outcome.score, 0, "отрицательные баллы обрезаны до 0");
  assert.equal(outcome.correctAnswers, 0);
  assert.equal(outcome.outcome, "FAILED");
});
