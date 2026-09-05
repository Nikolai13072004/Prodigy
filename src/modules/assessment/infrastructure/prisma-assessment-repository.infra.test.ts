import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaAssessmentRepository as repo } from "./prisma-assessment-repository";

// Инфра-тест репозитория сдачи теста против настоящей (временной) БД. Запуск: npm run test:infra.

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

test("transact: попытки загружены и отсортированы по attemptNumber asc", async () => {
  await seedUser("u-asm-1");
  await seedQuiz({ courseId: "c-asm-1", itemId: "i-asm-1", quizId: "q-asm-1" });
  // Вставляем в обратном порядке — репозиторий должен отдать отсортированными.
  await seedAttempt({ id: "a-asm-1-2", quizId: "q-asm-1", userId: "u-asm-1", attemptNumber: 2 });
  await seedAttempt({ id: "a-asm-1-1", quizId: "q-asm-1", userId: "u-asm-1", attemptNumber: 1 });

  const numbers = await repo.transact({
    quizId: "q-asm-1",
    userId: "u-asm-1",
    execute: async (tx) => tx.attempts.map((attempt) => attempt.attemptNumber),
  });
  assert.deepEqual(numbers, [1, 2]);
});

test("createAttempt: создаёт QuizAttempt с внедрёнными quizId/userId", async () => {
  await seedUser("u-asm-2");
  await seedQuiz({ courseId: "c-asm-2", itemId: "i-asm-2", quizId: "q-asm-2" });

  const created = await repo.transact({
    quizId: "q-asm-2",
    userId: "u-asm-2",
    execute: (tx) =>
      tx.createAttempt({
        attemptNumber: 1,
        answers: '{"q1":0}',
        questionSnapshot: "[]",
        score: 8,
        maxScore: 10,
        correctAnswers: 4,
        totalQuestions: 5,
        outcome: "PASSED",
        completedAt: new Date(),
      }),
  });
  assert.equal(created.attemptNumber, 1);
  assert.equal(created.outcome, "PASSED");

  const row = await prisma.quizAttempt.findUnique({ where: { id: created.id } });
  assert.equal(row?.quizId, "q-asm-2", "quizId внедрён репозиторием");
  assert.equal(row?.userId, "u-asm-2", "userId внедрён репозиторием");
  assert.equal(row?.score, 8);
});

test("updateAttempt: обновляет существующую попытку", async () => {
  await seedUser("u-asm-3");
  await seedQuiz({ courseId: "c-asm-3", itemId: "i-asm-3", quizId: "q-asm-3" });
  await seedAttempt({
    id: "a-asm-3",
    quizId: "q-asm-3",
    userId: "u-asm-3",
    attemptNumber: 1,
    outcome: "IN_PROGRESS",
  });

  const updated = await repo.transact({
    quizId: "q-asm-3",
    userId: "u-asm-3",
    execute: (tx) =>
      tx.updateAttempt("a-asm-3", {
        answers: "{}",
        questionSnapshot: "[]",
        score: 10,
        maxScore: 10,
        correctAnswers: 5,
        totalQuestions: 5,
        outcome: "PASSED",
        completedAt: new Date(),
      }),
  });
  assert.equal(updated.outcome, "PASSED");
  assert.equal(updated.score, 10);

  const row = await prisma.quizAttempt.findUnique({ where: { id: "a-asm-3" } });
  assert.equal(row?.outcome, "PASSED");
  assert.equal(row?.correctAnswers, 5);
});

test("saveBestResult: upsert по (quizId,userId) — создаёт, затем обновляет одну строку", async () => {
  await seedUser("u-asm-4");
  await seedQuiz({ courseId: "c-asm-4", itemId: "i-asm-4", quizId: "q-asm-4" });
  await seedAttempt({
    id: "a-asm-4",
    quizId: "q-asm-4",
    userId: "u-asm-4",
    attemptNumber: 1,
    score: 6,
    correctAnswers: 3,
  });

  await repo.transact({
    quizId: "q-asm-4",
    userId: "u-asm-4",
    execute: (tx) =>
      tx.saveBestResult({
        bestAttemptId: "a-asm-4",
        bestScore: 6,
        bestMaxScore: 10,
        bestCorrectAnswers: 3,
        attemptsUsed: 1,
        status: "FAILED",
      }),
  });

  const created = await prisma.quizUserBestResult.findUnique({
    where: { quizId_userId: { quizId: "q-asm-4", userId: "u-asm-4" } },
  });
  assert.equal(created?.bestScore, 6);
  assert.equal(created?.status, "FAILED");

  // Повторный вызов по тому же (quizId,userId) — должен обновить, а не создать вторую строку.
  await repo.transact({
    quizId: "q-asm-4",
    userId: "u-asm-4",
    execute: (tx) =>
      tx.saveBestResult({
        bestAttemptId: "a-asm-4",
        bestScore: 10,
        bestMaxScore: 10,
        bestCorrectAnswers: 5,
        attemptsUsed: 2,
        status: "PASSED",
      }),
  });

  const rows = await prisma.quizUserBestResult.findMany({
    where: { quizId: "q-asm-4", userId: "u-asm-4" },
  });
  assert.equal(rows.length, 1, "upsert не должен плодить строки");
  assert.equal(rows[0].bestScore, 10);
  assert.equal(rows[0].attemptsUsed, 2);
  assert.equal(rows[0].status, "PASSED");
});
