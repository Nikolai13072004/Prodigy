import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  ContentRepository,
  ContentTransaction,
  CourseContentItemType,
} from "../application/ports";

function createTransaction(client: Prisma.TransactionClient): ContentTransaction {
  return {
    findActiveModule(courseId, moduleId) {
      return client.courseModule.findFirst({
        where: { id: moduleId, courseId, archivedAt: null },
        select: { id: true },
      });
    },
    findFirstActiveModule(courseId) {
      return client.courseModule.findFirst({
        where: { courseId, archivedAt: null },
        orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
        select: { id: true },
      });
    },
    async nextModuleOrderIndex(courseId) {
      const last = await client.courseModule.findFirst({
        where: { courseId, archivedAt: null },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      return (last?.orderIndex ?? -1) + 1;
    },
    async nextItemOrderIndex(courseId) {
      const last = await client.courseItem.findFirst({
        where: { courseId, archivedAt: null },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      return (last?.orderIndex ?? -1) + 1;
    },
    createModule(args) {
      return client.courseModule.create({ data: args, select: { id: true } });
    },
    async updateModule(args) {
      await client.courseModule.update({
        where: { id: args.moduleId },
        data: { title: args.title, description: args.description },
      });
    },
    async archiveModule(courseId, moduleId, archivedAt) {
      await client.courseItem.updateMany({
        where: { courseId, moduleId, archivedAt: null },
        data: { archivedAt },
      });
      await client.courseModule.update({ where: { id: moduleId }, data: { archivedAt } });
    },
    createItem(data) {
      return client.courseItem.create({
        data: {
          courseId: data.courseId,
          moduleId: data.moduleId,
          orderIndex: data.orderIndex,
          type: data.type,
          title: data.title,
          content: data.type === "TEXT" ? data.content : null,
          fileUrl: data.type === "VIDEO" || data.type === "PDF" ? data.fileUrl : null,
          totalSlides: data.type === "PDF" ? data.totalSlides : null,
          presentationViewMode: data.type === "PDF" ? data.presentationViewMode : "PDF_PREVIEW",
          isRequired: data.isRequired,
          quiz: data.quiz ? { create: data.quiz } : undefined,
          surveyTemplate: data.survey
            ? {
                create: {
                  courseId: data.courseId,
                  title: data.survey.title,
                  description: data.survey.description,
                  isActive: data.survey.isActive,
                  isRequired: data.survey.isRequired,
                  questions: { create: data.survey.questions },
                },
              }
            : undefined,
        },
        select: { id: true },
      }).then(async (created) => {
        if (data.coverUrl !== undefined || data.thumbnailUrl !== undefined) {
          await client.course.update({
            where: { id: data.courseId },
            data: {
              ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
              ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl } : {}),
            },
          });
        }
        return created;
      });
    },
    async findActiveItem(courseId, itemId) {
      const item = await client.courseItem.findFirst({
        where: { id: itemId, courseId, archivedAt: null },
        select: { id: true, type: true },
      });
      if (!item) return null;
      return { id: item.id, type: item.type as CourseContentItemType };
    },
    async updateItem(data) {
      const item = await client.courseItem.findUniqueOrThrow({
        where: { id: data.itemId },
        select: { type: true },
      });
      await client.courseItem.update({
        where: { id: data.itemId },
        data: {
          moduleId: data.moduleId,
          title: data.title,
          isRequired: data.isRequired,
          content: item.type === "TEXT" ? data.content : null,
          fileUrl: item.type === "VIDEO" || item.type === "PDF" ? data.fileUrl : null,
          totalSlides: item.type === "PDF" ? data.totalSlides : null,
          presentationViewMode: item.type === "PDF" ? data.presentationViewMode : "PDF_PREVIEW",
        },
      });
      if (data.coverUrl !== undefined || data.thumbnailUrl !== undefined) {
        await client.course.update({
          where: { id: data.courseId },
          data: {
            ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
            ...(data.thumbnailUrl !== undefined ? { thumbnailUrl: data.thumbnailUrl } : {}),
          },
        });
      }
    },
    async archiveItem(courseId, itemId, archivedAt) {
      const result = await client.courseItem.updateMany({
        where: { id: itemId, courseId, archivedAt: null },
        data: { archivedAt },
      });
      return result.count > 0;
    },
    async loadOrdering(courseId) {
      const [modules, items] = await Promise.all([
        client.courseModule.findMany({
          where: { courseId, archivedAt: null },
          orderBy: [{ orderIndex: "asc" }, { title: "asc" }, { id: "asc" }],
          select: { id: true },
        }),
        client.courseItem.findMany({
          where: { courseId, archivedAt: null },
          orderBy: [{ orderIndex: "asc" }, { title: "asc" }, { id: "asc" }],
          select: { id: true, moduleId: true },
        }),
      ]);
      return { moduleIds: modules.map((module) => module.id), items };
    },
    async updateItemOrder(items) {
      for (const item of items) {
        await client.courseItem.update({
          where: { id: item.id },
          data: { orderIndex: item.orderIndex },
        });
      }
    },
    async markContentChanged(courseId) {
      await client.course.updateMany({
        where: { id: courseId, status: "PUBLISHED" },
        data: { hasUnpublishedChanges: true },
      });
    },
    findQuiz(courseId, quizId) {
      return client.quiz.findFirst({
        where: { id: quizId, courseItem: { courseId, archivedAt: null } },
        select: { id: true },
      });
    },
    async updateQuizSettings(args) {
      await client.quiz.update({
        where: { id: args.quizId },
        data: {
          maxAttempts: args.maxAttempts,
          minCorrectAnswers: args.minCorrectAnswers,
          timeLimitMinutes: args.timeLimitMinutes,
          shuffleQuestions: args.shuffleQuestions,
          shuffleAnswers: args.shuffleAnswers,
          lockMaterialsOnStart: args.lockMaterialsOnStart,
        },
      });
    },
    async nextQuestionOrderIndex(quizId) {
      const last = await client.question.findFirst({
        where: { quizId, archivedAt: null },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      return (last?.orderIndex ?? -1) + 1;
    },
    async createQuestion(args) {
      await client.question.create({ data: args });
    },
    async archiveQuestion(courseId, questionId, archivedAt) {
      const result = await client.question.updateMany({
        where: { id: questionId, quiz: { courseItem: { courseId } }, archivedAt: null },
        data: { archivedAt },
      });
      return result.count > 0;
    },
  };
}

export const prismaContentRepository: ContentRepository = {
  transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
