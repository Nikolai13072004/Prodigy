import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCertificateSnapshot,
  computeCertificateScorePercent,
  parseCertificateSnapshot,
  type CertificateCourseItem,
} from "./certificate-snapshot";

// Иммутабельный снимок сертификата: сборка, round-trip и расчёт балла.

function material(id: string, progress: number): CertificateCourseItem {
  return { id, type: "TEXT", isRequired: true, title: id, materialProgress: progress };
}

function passedQuiz(id: string, score: number, maxScore: number): CertificateCourseItem {
  return {
    id,
    type: "QUIZ",
    isRequired: true,
    title: id,
    quiz: {
      maxAttempts: 1,
      minCorrectAnswers: 1,
      attempts: [
        { outcome: "PASSED", correctAnswers: 1, attemptNumber: 1, score, maxScore, completedAt: new Date("2026-08-20T10:00:00Z") },
      ],
    },
  };
}

const BASE = {
  learner: { name: "Иван Петров", firstName: "Иван", lastName: "Петров" as string | null, login: "ivan" },
  course: {
    id: "c1",
    title: "Основы финансов",
    durationMinutes: 90,
    category: "FINANCE",
    statusFormat: "PASSED_WITH_SCORE",
  },
  items: [material("m1", 100), passedQuiz("q1", 8, 10)],
  completedAt: new Date("2026-08-25T10:00:00Z"),
  platform: { siteName: "Smart LMS", logoUrl: null as string | null },
};

test("buildCertificateSnapshot собирает снимок и считает завершённость", () => {
  const snapshot = buildCertificateSnapshot(BASE);
  assert.equal(snapshot.formatVersion, 1);
  assert.equal(snapshot.learner.fullName, "Иван Петров");
  assert.equal(snapshot.course.title, "Основы финансов");
  assert.equal(snapshot.completion.completedAt, "2026-08-25T10:00:00.000Z");
  assert.equal(snapshot.completion.requiredTotal, 2);
  assert.equal(snapshot.completion.completedRequired, 2);
  assert.equal(snapshot.completion.percent, 100);
  assert.equal(snapshot.completion.scorePercent, 80, "8/10 = 80%");
  assert.equal(snapshot.completion.stages.length, 2);
  assert.deepEqual(
    snapshot.completion.stages.map((s) => s.type).sort(),
    ["QUIZ", "TEXT"],
  );
  assert.ok(snapshot.completion.stages.every((s) => s.status === "COMPLETED"));
});

test("fullName собирается из имени/фамилии, при пустых — фолбэк на name", () => {
  assert.equal(buildCertificateSnapshot(BASE).learner.fullName, "Иван Петров");

  const noParts = buildCertificateSnapshot({
    ...BASE,
    learner: { name: "Гость Системы", firstName: "", lastName: null, login: "guest" },
  });
  assert.equal(noParts.learner.fullName, "Гость Системы", "фолбэк на User.name");
});

test("round-trip build → JSON → parse сохраняет снимок", () => {
  const snapshot = buildCertificateSnapshot(BASE);
  const restored = parseCertificateSnapshot(JSON.stringify(snapshot));
  assert.deepEqual(restored, snapshot);
});

test("parseCertificateSnapshot: явный отказ на неизвестной версии и мусоре", () => {
  assert.throws(() => parseCertificateSnapshot(JSON.stringify({ formatVersion: 2 })), /версия/);
  assert.throws(() => parseCertificateSnapshot("не json"), /разобрать/);
  assert.throws(() => parseCertificateSnapshot("123"), /повреждён/, "число — не объект-снимок");
});

test("computeCertificateScorePercent: только для PASSED_WITH_SCORE, среднее по тестам", () => {
  const items = [passedQuiz("q1", 8, 10), passedQuiz("q2", 10, 10), material("m1", 100)];
  assert.equal(computeCertificateScorePercent(items, "PASSED_WITH_SCORE"), 90, "(80+100)/2");
  assert.equal(computeCertificateScorePercent(items, "COMPLETED_ONLY"), null, "другой формат → null");
  assert.equal(
    computeCertificateScorePercent([material("m1", 100)], "PASSED_WITH_SCORE"),
    null,
    "нет тестов → null",
  );
});
