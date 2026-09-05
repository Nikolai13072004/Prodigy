import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  QuizBuilderRepository,
  QuizBuilderTransaction,
} from "../application/quiz-builder-ports";

function createTransaction(
  client: Prisma.TransactionClient,
): QuizBuilderTransaction {
  return {
    async updateSettings(input) {
      await client.courseItem.update({
        where: { id: input.courseItemId },
        data: { title: input.settings.title },
      });
      await client.quiz.update({
        where: { id: input.quizId },
        data: {
          description: input.settings.description,
          maxAttempts: input.settings.maxAttempts,
          minCorrectAnswers: input.settings.minCorrectAnswers,
          timeLimitMinutes: input.settings.timeLimitMinutes,
          questionPoolSize: input.settings.questionPoolSize,
          retryDelayMinutes: input.settings.retryDelayMinutes,
          shuffleQuestions: input.settings.shuffleQuestions,
          shuffleAnswers: input.settings.shuffleAnswers,
          lockMaterialsOnStart: input.settings.lockMaterialsOnStart,
          trackSecurityEvents: input.settings.trackSecurityEvents,
        },
      });
      await client.course.update({
        where: { id: input.courseId },
        data: { resultViewMode: input.settings.resultViewMode },
      });
    },

    async createQuestion(input) {
      const created = await client.question.create({
        data: {
          quizId: input.quizId,
          orderIndex: input.orderIndex,
          type: input.data.type,
          prompt: input.data.prompt,
          points: input.data.points,
          config: input.data.config,
        },
        select: { id: true },
      });
      return created;
    },

    async createQuestionBatch(input) {
      const created: Array<{ id: string }> = [];
      // createMany не возвращает id, а use-case (importFromDocx) хочет знать
      // первый созданный id. Стоимость N create в одной транзакции для DOCX
      // импорта (10-100 вопросов) приемлема.
      for (let i = 0; i < input.items.length; i += 1) {
        const item = input.items[i];
        const row = await client.question.create({
          data: {
            quizId: input.quizId,
            orderIndex: input.startOrderIndex + i,
            type: item.type,
            prompt: item.prompt,
            points: item.points,
            config: item.config,
          },
          select: { id: true },
        });
        created.push(row);
      }
      return created;
    },

    async updateQuestion(input) {
      await client.question.update({
        where: { id: input.questionId },
        data: {
          prompt: input.data.prompt,
          points: input.data.points,
          config: input.data.config,
        },
      });
    },

    async swapQuestionsOrder(a, aOrderIndex, b, bOrderIndex) {
      // Prisma не даёт SWAP без промежуточного шага (нет @@unique на
      // (quizId, orderIndex), но клиентская логика ожидает уникальность).
      // Три update внутри транзакции: `a` → -1, `b` → aOrderIndex, `a` →
      // bOrderIndex.
      await client.question.update({
        where: { id: a },
        data: { orderIndex: -1 },
      });
      await client.question.update({
        where: { id: b },
        data: { orderIndex: aOrderIndex },
      });
      await client.question.update({
        where: { id: a },
        data: { orderIndex: bOrderIndex },
      });
    },

    async archiveQuestion(questionId, now) {
      await client.question.update({
        where: { id: questionId },
        data: { archivedAt: now },
      });
    },

    async archiveQuizItem(courseItemId, now) {
      await client.courseItem.update({
        where: { id: courseItemId },
        data: { archivedAt: now },
      });
    },

    async markCourseContentChangedIfPublished(courseId) {
      const course = await client.course.findUnique({
        where: { id: courseId },
        select: { status: true },
      });
      if (!course || course.status !== "PUBLISHED") return;
      await client.course.update({
        where: { id: courseId },
        data: { hasUnpublishedChanges: true },
      });
    },
  };
}

export const prismaQuizBuilderRepository: QuizBuilderRepository = {
  async findQuiz(courseId, quizId) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        courseItemId: true,
        courseItem: { select: { courseId: true } },
      },
    });
    if (!quiz || quiz.courseItem.courseId !== courseId) return null;
    return { id: quiz.id, courseItemId: quiz.courseItemId };
  },

  async findQuestion(quizId, questionId) {
    const row = await prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, quizId: true, type: true, config: true },
    });
    if (!row || row.quizId !== quizId) return null;
    return { id: row.id, type: row.type, config: row.config };
  },

  async findExistingPrompts(quizId) {
    const rows = await prisma.question.findMany({
      where: { quizId, archivedAt: null },
      select: { prompt: true },
    });
    return new Set(rows.map((row) => row.prompt));
  },

  async getQuestionsOrder(quizId) {
    return prisma.question.findMany({
      where: { quizId, archivedAt: null },
      orderBy: { orderIndex: "asc" },
      select: { id: true, orderIndex: true },
    });
  },

  async nextOrderIndex(quizId) {
    const last = await prisma.question.findFirst({
      where: { quizId, archivedAt: null },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    return (last?.orderIndex ?? -1) + 1;
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
