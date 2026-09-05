import assert from "node:assert/strict";
import test from "node:test";
import {
  AssessmentDomainError,
  assertTimeLimit,
  getAssessmentStatus,
  getBestAssessmentAttempt,
  scoreAssessmentQuestion,
  serializeQuestionSnapshot,
  type AssessmentAttempt,
  type AssessmentQuestion,
} from "./assessment";

// Дополняет assessment.test.ts: подробное покрытие оценивания одного вопроса
// по типам, выбора лучшей попытки, статуса, лимита времени и снапшота вопросов.

function question(overrides: Partial<AssessmentQuestion>): AssessmentQuestion {
  return {
    id: "q",
    orderIndex: 0,
    type: "SINGLE_CHOICE",
    prompt: "?",
    config: "{}",
    points: 2,
    ...overrides,
  };
}

// -------------------------------------------------- SINGLE_CHOICE

test("SINGLE_CHOICE: верный индекс засчитывается, строка приводится к числу", () => {
  const q = question({ config: JSON.stringify({ correctIndex: 1 }), points: 2 });
  assert.deepEqual(scoreAssessmentQuestion(q, 1), {
    questionId: "q",
    earned: 2,
    max: 2,
    isCorrect: true,
    requiresManualReview: false,
  });
  assert.equal(scoreAssessmentQuestion(q, "1").isCorrect, true, "строковый ответ парсится");
});

test("SINGLE_CHOICE: неверный, отсутствующий и нечисловой ответ не засчитываются", () => {
  const q = question({ config: JSON.stringify({ correctIndex: 1 }) });
  assert.equal(scoreAssessmentQuestion(q, 0).isCorrect, false);
  assert.equal(scoreAssessmentQuestion(q, undefined).isCorrect, false);
  assert.equal(scoreAssessmentQuestion(q, null).isCorrect, false);
  assert.equal(scoreAssessmentQuestion(q, "abc").isCorrect, false);
  assert.equal(scoreAssessmentQuestion(q, 0).earned, 0);
});

// -------------------------------------------------- OPEN

test("OPEN (авто): сравнение без учёта регистра и пробелов", () => {
  const q = question({ type: "OPEN", config: JSON.stringify({ sampleAnswer: "Париж" }), points: 3 });
  assert.equal(scoreAssessmentQuestion(q, "  париж ").isCorrect, true);
  assert.equal(scoreAssessmentQuestion(q, "париж").earned, 3);
  assert.equal(scoreAssessmentQuestion(q, "Лондон").isCorrect, false);
});

test("OPEN (авто): без эталона или с нестроковым ответом — не верно", () => {
  const noSample = question({ type: "OPEN", config: "{}" });
  assert.equal(scoreAssessmentQuestion(noSample, "что угодно").isCorrect, false);
  const withSample = question({ type: "OPEN", config: JSON.stringify({ sampleAnswer: "да" }) });
  assert.equal(scoreAssessmentQuestion(withSample, 42).isCorrect, false, "не строка → не верно");
});

test("OPEN (ручной): помечается на проверку и не оценивается автоматически", () => {
  const q = question({ type: "OPEN", config: JSON.stringify({ reviewMode: "MANUAL", sampleAnswer: "да" }), points: 5 });
  const result = scoreAssessmentQuestion(q, "да");
  assert.equal(result.requiresManualReview, true);
  assert.equal(result.isCorrect, false, "ручной вопрос не засчитывается сам");
  assert.equal(result.earned, 0);
});

// -------------------------------------------------- MATCHING

test("MATCHING: совпадение пар с учётом порядка; строки парсятся", () => {
  const q = question({ type: "MATCHING", config: JSON.stringify({ correctPairs: [0, 1, 2] }), points: 4 });
  assert.equal(scoreAssessmentQuestion(q, [0, 1, 2]).isCorrect, true);
  assert.equal(scoreAssessmentQuestion(q, ["0", "1", "2"]).isCorrect, true, "строки приводятся к числам");
  assert.equal(scoreAssessmentQuestion(q, [2, 1, 0]).isCorrect, false, "порядок важен");
  assert.equal(scoreAssessmentQuestion(q, [0, 1]).isCorrect, false, "длина должна совпадать");
  assert.equal(scoreAssessmentQuestion(q, "не массив").isCorrect, false);
});

// -------------------------------------------------- FILE / прочее

test("FILE всегда уходит на ручную проверку без автобаллов", () => {
  const result = scoreAssessmentQuestion(question({ type: "FILE", points: 5 }), "/uploads/quiz-attachments/x.pdf");
  assert.equal(result.requiresManualReview, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.earned, 0);
});

test("неизвестный тип: ноль баллов, без ручной проверки", () => {
  const result = scoreAssessmentQuestion(question({ type: "UNKNOWN" }), "x");
  assert.equal(result.isCorrect, false);
  assert.equal(result.requiresManualReview, false);
  assert.equal(result.earned, 0);
});

test("баллы нормализуются: дробное усечь, отрицательное — до нуля", () => {
  const frac = scoreAssessmentQuestion(
    question({ config: JSON.stringify({ correctIndex: 0 }), points: 2.9 }),
    0,
  );
  assert.equal(frac.max, 2, "2.9 → 2");
  assert.equal(frac.earned, 2);
  const neg = scoreAssessmentQuestion(
    question({ config: JSON.stringify({ correctIndex: 0 }), points: -5 }),
    0,
  );
  assert.equal(neg.max, 0, "отрицательные баллы → 0");
  assert.equal(neg.earned, 0);
});

// -------------------------------------------------- getBestAssessmentAttempt

test("getBestAssessmentAttempt: приоритет верных → баллов → номера попытки", () => {
  const attempts = [
    { correctAnswers: 3, score: 5, attemptNumber: 1 },
    { correctAnswers: 3, score: 8, attemptNumber: 2 }, // больше баллов при равных верных
    { correctAnswers: 2, score: 10, attemptNumber: 3 },
  ];
  assert.equal(getBestAssessmentAttempt(attempts)?.attemptNumber, 2);
  // при равных верных и баллах — берётся более поздняя попытка
  const tie = [
    { correctAnswers: 1, score: 1, attemptNumber: 1 },
    { correctAnswers: 1, score: 1, attemptNumber: 4 },
  ];
  assert.equal(getBestAssessmentAttempt(tie)?.attemptNumber, 4);
});

test("getBestAssessmentAttempt: пустой список → null", () => {
  assert.equal(getBestAssessmentAttempt([]), null);
});

// -------------------------------------------------- getAssessmentStatus

test("getAssessmentStatus: PASSED важнее любого незавершённого", () => {
  assert.equal(
    getAssessmentStatus({
      attempts: [{ outcome: "IN_PROGRESS" }],
      bestOutcome: "PASSED",
      maxAttempts: 3,
    }),
    "PASSED",
  );
});

test("getAssessmentStatus: незавершённая попытка держит статус IN_PROGRESS", () => {
  assert.equal(
    getAssessmentStatus({ attempts: [{ outcome: "IN_PROGRESS" }], bestOutcome: null, maxAttempts: 3 }),
    "IN_PROGRESS",
  );
});

test("getAssessmentStatus: ожидание ручной проверки", () => {
  assert.equal(
    getAssessmentStatus({ attempts: [{ outcome: "PENDING_REVIEW" }], bestOutcome: null, maxAttempts: 3 }),
    "PENDING_REVIEW",
  );
});

test("getAssessmentStatus: исчерпание попыток → FAILED, иначе ещё можно", () => {
  const three = [{ outcome: "FAILED" }, { outcome: "FAILED" }, { outcome: "FAILED" }];
  assert.equal(getAssessmentStatus({ attempts: three, bestOutcome: "FAILED", maxAttempts: 3 }), "FAILED");
  assert.equal(
    getAssessmentStatus({ attempts: [{ outcome: "FAILED" }], bestOutcome: "FAILED", maxAttempts: 3 }),
    "IN_PROGRESS",
    "остались попытки",
  );
});

// -------------------------------------------------- assertTimeLimit

const CREATED = new Date("2026-08-13T10:00:00Z");

function timedAttempt(): Pick<AssessmentAttempt, "createdAt"> {
  return { createdAt: CREATED };
}

test("assertTimeLimit: без попытки или без лимита не бросает", () => {
  assert.doesNotThrow(() =>
    assertTimeLimit({ attempt: null, timeLimitMinutes: 30, now: new Date("2026-08-13T12:00:00Z") }),
  );
  assert.doesNotThrow(() =>
    assertTimeLimit({ attempt: timedAttempt(), timeLimitMinutes: null, now: new Date("2026-08-13T12:00:00Z") }),
  );
});

test("assertTimeLimit: до истечения — ок, после — TIME_LIMIT_EXPIRED", () => {
  assert.doesNotThrow(() =>
    assertTimeLimit({ attempt: timedAttempt(), timeLimitMinutes: 30, now: new Date("2026-08-13T10:29:00Z") }),
  );
  assert.throws(
    () => assertTimeLimit({ attempt: timedAttempt(), timeLimitMinutes: 30, now: new Date("2026-08-13T10:31:00Z") }),
    (error: unknown) => error instanceof AssessmentDomainError && error.code === "TIME_LIMIT_EXPIRED",
  );
});

test("assertTimeLimit: льготный период на отправку продлевает срок", () => {
  // истекает 10:30, отправка в 10:30:30 при grace 60с — ещё допустима
  assert.doesNotThrow(() =>
    assertTimeLimit({
      attempt: timedAttempt(),
      timeLimitMinutes: 30,
      now: new Date("2026-08-13T10:30:30Z"),
      submissionGraceMs: 60_000,
    }),
  );
});

// -------------------------------------------------- serializeQuestionSnapshot

test("serializeQuestionSnapshot: сохраняет только доменные поля", () => {
  const noisy = {
    ...question({ id: "a", type: "OPEN", config: "{}", points: 3 }),
    // посторонние поля не должны попасть в снапшот
    secret: "нельзя",
    createdAt: new Date(),
  } as unknown as AssessmentQuestion;
  const parsed = JSON.parse(serializeQuestionSnapshot([noisy]));
  assert.deepEqual(parsed, [
    { id: "a", orderIndex: 0, type: "OPEN", prompt: "?", config: "{}", points: 3 },
  ]);
});
