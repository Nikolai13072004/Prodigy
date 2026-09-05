import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { AssessmentReviewTargetNotFoundError } from "@/modules/assessment/application/review-ports";
import { prismaAssessmentReviewRepository as repo } from "./prisma-assessment-review-repository";

// Инфра-тест репозитория ручной проверки попытки против настоящей (временной) БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x" },
  });
}

async function seedQuiz(args: {
  courseId: string;
  itemId: string;
  quizId: string;
  maxAttempts?: number;
  minCorrectAnswers?: number;
}) {
  await prisma.course.create({ data: { id: args.courseId, title: `Course ${args.courseId}` } });
  await prisma.courseItem.create({
    data: { id: args.itemId, courseId: args.courseId, type: "QUIZ", title: "Тест", orderIndex: 0 },
  });
  await prisma.quiz.create({
    data: {
      id: args.quizId,
      courseItemId: args.itemId,
      maxAttempts: args.maxAttempts ?? 3,
      minCorrectAnswers: args.minCorrectAnswers ?? 3,
    },
  });
}

function seedAttempt(args: {
  id: string;
  quizId: string;
  userId: string;
  attemptNumber: number;
  score?: number;
  correctAnswers?: number;
  outcome?: string;
}) {
  return prisma.quizAttempt.create({
    data: {
      id: args.id,
      quizId: args.quizId,
      userId: args.userId,
      attemptNumber: args.attemptNumber,
      answers: "{}",
      questionSnapshot: "[]",
      score: args.score ?? 0,
      maxScore: 10,
      correctAnswers: args.correctAnswers ?? 0,
      totalQuestions: 5,
      outcome: args.outcome ?? "FAILED",
      completedAt: new Date(),
    },
  });
}

test("transactReview: загружает target по attemptId + связанные quiz и attempts", async () => {
  await seedUser("u-asr-1");
  await seedQuiz({ courseId: "c-asr-1", itemId: "i-asr-1", quizId: "q-asr-1" });
  // Две попытки — target наводим на вторую; репозиторий должен отдать её и весь список.
  await seedAttempt({ id: "a-asr-1-1", quizId: "q-asr-1", userId: "u-asr-1", attemptNumber: 1 });
  await seedAttempt({ id: "a-asr-1-2", quizId: "q-asr-1", userId: "u-asr-1", attemptNumber: 2 });

  const loaded = await repo.transactReview({
    attemptId: "a-asr-1-2",
    execute: async (tx) => ({
      targetId: tx.target.id,
      targetQuizId: tx.target.quizId,
      targetUserId: tx.target.userId,
      quizId: tx.quiz.id,
      minCorrectAnswers: tx.quiz.minCorrectAnswers,
      attemptNumbers: tx.attempts.map((attempt) => attempt.attemptNumber),
    }),
  });

  assert.equal(loaded.targetId, "a-asr-1-2", "target загружен по attemptId");
  assert.equal(loaded.targetQuizId, "q-asr-1");
  assert.equal(loaded.targetUserId, "u-asr-1");
  assert.equal(loaded.quizId, "q-asr-1", "связанный quiz доступен в транзакции");
  assert.equal(loaded.minCorrectAnswers, 3);
  assert.deepEqual(loaded.attemptNumbers, [1, 2], "attempts отсортированы по attemptNumber asc");
});

test("updateTarget: ручная проверка проставляет score/correctAnswers/outcome и метаданные ревью", async () => {
  await seedUser("u-asr-2");
  await seedQuiz({ courseId: "c-asr-2", itemId: "i-asr-2", quizId: "q-asr-2" });
  await seedAttempt({
    id: "a-asr-2",
    quizId: "q-asr-2",
    userId: "u-asr-2",
    attemptNumber: 1,
    score: 0,
    correctAnswers: 0,
    outcome: "FAILED",
  });

  const reviewedAt = new Date();
  const updated = await repo.transactReview({
    attemptId: "a-asr-2",
    execute: (tx) =>
      tx.updateTarget({
        score: 9,
        maxScore: 10,
        correctAnswers: 5,
        totalQuestions: 5,
        outcome: "PASSED",
        manualReviewJson: '{"q1":{"awarded":3}}',
        reviewComment: "Хорошая работа",
        reviewedAt,
        reviewedById: "u-asr-2-teacher",
        reviewedByName: "Преподаватель",
      }),
  });

  assert.equal(updated.outcome, "PASSED");
  assert.equal(updated.score, 9);
  assert.equal(updated.correctAnswers, 5);

  const row = await prisma.quizAttempt.findUnique({ where: { id: "a-asr-2" } });
  assert.equal(row?.outcome, "PASSED", "outcome обновлён в БД");
  assert.equal(row?.score, 9);
  assert.equal(row?.correctAnswers, 5);
  assert.equal(row?.manualReviewJson, '{"q1":{"awarded":3}}');
  assert.equal(row?.reviewComment, "Хорошая работа");
  assert.equal(row?.reviewedById, "u-asr-2-teacher");
  assert.equal(row?.reviewedByName, "Преподаватель");
  assert.notEqual(row?.reviewedAt, null, "reviewedAt проставлен");
});

test("saveBestResult: upsert по (quizId,userId) — создаёт, затем обновляет одну строку", async () => {
  await seedUser("u-asr-3");
  await seedQuiz({ courseId: "c-asr-3", itemId: "i-asr-3", quizId: "q-asr-3" });
  await seedAttempt({
    id: "a-asr-3",
    quizId: "q-asr-3",
    userId: "u-asr-3",
    attemptNumber: 1,
    score: 6,
    correctAnswers: 3,
  });

  await repo.transactReview({
    attemptId: "a-asr-3",
    execute: (tx) =>
      tx.saveBestResult({
        bestAttemptId: "a-asr-3",
        bestScore: 6,
        bestMaxScore: 10,
        bestCorrectAnswers: 3,
        attemptsUsed: 1,
        status: "FAILED",
      }),
  });

  const created = await prisma.quizUserBestResult.findUnique({
    where: { quizId_userId: { quizId: "q-asr-3", userId: "u-asr-3" } },
  });
  assert.equal(created?.bestScore, 6);
  assert.equal(created?.status, "FAILED");

  // Повторная ручная проверка той же попытки — upsert должен обновить существующую строку.
  await repo.transactReview({
    attemptId: "a-asr-3",
    execute: (tx) =>
      tx.saveBestResult({
        bestAttemptId: "a-asr-3",
        bestScore: 9,
        bestMaxScore: 10,
        bestCorrectAnswers: 5,
        attemptsUsed: 1,
        status: "PASSED",
      }),
  });

  const rows = await prisma.quizUserBestResult.findMany({
    where: { quizId: "q-asr-3", userId: "u-asr-3" },
  });
  assert.equal(rows.length, 1, "upsert не должен плодить строки");
  assert.equal(rows[0].bestScore, 9);
  assert.equal(rows[0].status, "PASSED");
});

test("transactReview: несуществующий attemptId бросает AssessmentReviewTargetNotFoundError", async () => {
  await assert.rejects(
    repo.transactReview({
      attemptId: "a-asr-missing",
      execute: async () => "unreachable",
    }),
    AssessmentReviewTargetNotFoundError,
  );
});
