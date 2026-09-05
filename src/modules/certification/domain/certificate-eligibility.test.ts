import assert from "node:assert/strict";
import { test } from "node:test";
import { decideCertificateIssuance } from "./certificate-eligibility";
import type { CertificateCourseItem } from "./certificate-snapshot";

// Правило выдачи: ключевой инвариант — провалённый обязательный тест НЕ даёт сертификат,
// несмотря на дефолтный quizGateMode="RESOLVED".

function material(id: string, progress: number, isRequired = true): CertificateCourseItem {
  return { id, type: "TEXT", isRequired, title: id, materialProgress: progress };
}

function quiz(id: string, outcome: string): CertificateCourseItem {
  return {
    id,
    type: "QUIZ",
    isRequired: true,
    title: id,
    quiz: {
      maxAttempts: 1,
      minCorrectAnswers: 1,
      attempts: [
        { outcome, correctAnswers: outcome === "PASSED" ? 1 : 0, attemptNumber: 1, score: 0, maxScore: 1, completedAt: new Date("2026-08-20T10:00:00Z") },
      ],
    },
  };
}

test("выдаём, когда все обязательные этапы пройдены", () => {
  const decision = decideCertificateIssuance({
    isAssignedLearner: true,
    items: [material("m1", 100), quiz("q1", "PASSED")],
  });
  assert.deepEqual(decision, { issue: true, reason: "OK" });
});

test("КЛЮЧЕВОЕ: провалённый обязательный тест не даёт сертификат", () => {
  // FAILED «решён» (isResolved), но не пройден (isPassed) — при дефолтном RESOLVED
  // без строгого шлюза сертификат ушёл бы провалившему.
  const decision = decideCertificateIssuance({
    isAssignedLearner: true,
    items: [material("m1", 100), quiz("q1", "FAILED")],
  });
  assert.deepEqual(decision, { issue: false, reason: "QUIZ_NOT_PASSED" });
});

test("не выдаём, когда обязательный материал не пройден", () => {
  const decision = decideCertificateIssuance({
    isAssignedLearner: true,
    items: [material("m1", 0), quiz("q1", "PASSED")],
  });
  assert.deepEqual(decision, { issue: false, reason: "NOT_COMPLETED" });
});

test("не выдаём курс без обязательных этапов", () => {
  const decision = decideCertificateIssuance({
    isAssignedLearner: true,
    items: [material("m1", 100, false)],
  });
  assert.deepEqual(decision, { issue: false, reason: "NO_REQUIRED_ITEMS" });
});

test("не выдаём неназначенному пользователю (превью менеджера)", () => {
  const decision = decideCertificateIssuance({
    isAssignedLearner: false,
    items: [material("m1", 100)],
  });
  assert.deepEqual(decision, { issue: false, reason: "NOT_ENROLLED" });
});
