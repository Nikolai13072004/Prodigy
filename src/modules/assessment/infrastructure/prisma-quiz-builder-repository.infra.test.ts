import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaQuizBuilderRepository as repo } from "./prisma-quiz-builder-repository";

// Инфра-тест builder-репозитория против настоящей БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedCourseWithQuiz(courseIdSuffix: string) {
  const courseId = `qb-c-${courseIdSuffix}`;
  await prisma.course.create({
    data: { id: courseId, title: `Course ${courseId}`, status: "PUBLISHED" },
  });
  const courseItem = await prisma.courseItem.create({
    data: {
      courseId,
      type: "QUIZ",
      title: "QuizItem",
      orderIndex: 0,
      isRequired: true,
    },
  });
  const quiz = await prisma.quiz.create({
    data: {
      courseItemId: courseItem.id,
      maxAttempts: 1,
      minCorrectAnswers: 1,
    },
  });
  return { courseId, courseItem, quiz };
}

test("findQuiz: возвращает только если courseId совпадает", async () => {
  const { courseId, quiz } = await seedCourseWithQuiz("find-1");
  const found = await repo.findQuiz(courseId, quiz.id);
  assert.equal(found?.id, quiz.id);
  const wrong = await repo.findQuiz("other-course", quiz.id);
  assert.equal(wrong, null);
});

test("nextOrderIndex: игнорирует архивированные, инкрементирует max активный", async () => {
  const { quiz } = await seedCourseWithQuiz("order-1");
  assert.equal(await repo.nextOrderIndex(quiz.id), 0);
  await prisma.question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 0,
      type: "SINGLE_CHOICE",
      prompt: "Q0",
      config: "{}",
    },
  });
  await prisma.question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 5,
      type: "SINGLE_CHOICE",
      prompt: "Q5-archived",
      config: "{}",
      archivedAt: new Date(),
    },
  });
  assert.equal(await repo.nextOrderIndex(quiz.id), 1, "5 архив, максимум активных — 0");
});

test("updateSettings: обновляет courseItem/quiz/course.resultViewMode", async () => {
  const { courseId, courseItem, quiz } = await seedCourseWithQuiz("set-1");
  await repo.transact(async (tx) =>
    tx.updateSettings({
      courseItemId: courseItem.id,
      quizId: quiz.id,
      courseId,
      settings: {
        title: "New title",
        description: "desc",
        maxAttempts: 2,
        minCorrectAnswers: 1,
        timeLimitMinutes: 30,
        questionPoolSize: null,
        retryDelayMinutes: 5,
        shuffleQuestions: true,
        shuffleAnswers: true,
        lockMaterialsOnStart: false,
        trackSecurityEvents: true,
        resultViewMode: "SCORE_AND_ANSWERS",
      },
    }),
  );
  const item = await prisma.courseItem.findUnique({ where: { id: courseItem.id } });
  const quizRow = await prisma.quiz.findUnique({ where: { id: quiz.id } });
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  assert.equal(item?.title, "New title");
  assert.equal(quizRow?.description, "desc");
  assert.equal(quizRow?.trackSecurityEvents, true);
  assert.equal(course?.resultViewMode, "SCORE_AND_ANSWERS");
});

test("swapQuestionsOrder: обмен даёт (0,1) → (1,0), без коллизий по индексу", async () => {
  const { quiz } = await seedCourseWithQuiz("swap-1");
  const q1 = await prisma.question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 0,
      type: "SINGLE_CHOICE",
      prompt: "Q1",
      config: "{}",
    },
  });
  const q2 = await prisma.question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 1,
      type: "SINGLE_CHOICE",
      prompt: "Q2",
      config: "{}",
    },
  });

  await repo.transact(async (tx) => tx.swapQuestionsOrder(q1.id, 0, q2.id, 1));

  const [a, b] = await Promise.all([
    prisma.question.findUnique({ where: { id: q1.id } }),
    prisma.question.findUnique({ where: { id: q2.id } }),
  ]);
  assert.equal(a?.orderIndex, 1);
  assert.equal(b?.orderIndex, 0);
});

test("archiveQuestion: ставит archivedAt", async () => {
  const { quiz } = await seedCourseWithQuiz("archq-1");
  const question = await prisma.question.create({
    data: {
      quizId: quiz.id,
      orderIndex: 0,
      type: "SINGLE_CHOICE",
      prompt: "Q",
      config: "{}",
    },
  });
  const at = new Date("2026-05-01T10:00:00Z");
  await repo.transact(async (tx) => tx.archiveQuestion(question.id, at));
  const row = await prisma.question.findUnique({ where: { id: question.id } });
  assert.equal(row?.archivedAt?.toISOString(), at.toISOString());
});

test("archiveQuizItem: ставит archivedAt на CourseItem", async () => {
  const { courseItem } = await seedCourseWithQuiz("archi-1");
  const at = new Date("2026-05-01T10:00:00Z");
  await repo.transact(async (tx) => tx.archiveQuizItem(courseItem.id, at));
  const row = await prisma.courseItem.findUnique({ where: { id: courseItem.id } });
  assert.equal(row?.archivedAt?.toISOString(), at.toISOString());
});

test("markCourseContentChangedIfPublished: PUBLISHED → true, DRAFT → no-op", async () => {
  const draftCourse = await prisma.course.create({
    data: { id: "qb-c-draft", title: "Draft", status: "DRAFT" },
  });
  const { courseId } = await seedCourseWithQuiz("marked-1");
  await repo.transact(async (tx) => {
    await tx.markCourseContentChangedIfPublished(courseId);
    await tx.markCourseContentChangedIfPublished(draftCourse.id);
  });
  const pub = await prisma.course.findUnique({ where: { id: courseId } });
  const draft = await prisma.course.findUnique({ where: { id: draftCourse.id } });
  assert.equal(pub?.hasUnpublishedChanges, true);
  assert.equal(draft?.hasUnpublishedChanges, false);
});
