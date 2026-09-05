import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isUserAssignedToCourse } from "@/lib/access";
import type {
  SurveySubmissionRepository,
  SurveySubmissionTransaction,
} from "../application/survey-submission-ports";

function createTransaction(
  client: Prisma.TransactionClient,
): SurveySubmissionTransaction {
  return {
    async createItemResponse(input) {
      const response = await client.courseItemSurveyResponse.create({
        data: {
          templateId: input.templateId,
          courseId: input.courseId,
          courseItemId: input.courseItemId,
          userId: input.userId,
        },
        select: { id: true },
      });
      return response;
    },

    async createItemAnswers(responseId, answers) {
      // deleteMany оставили как в оригинале: свежесозданный response ещё
      // не имеет answers, но операция дешёвая и защищает от гонки.
      await client.courseItemSurveyAnswer.deleteMany({
        where: { responseId },
      });
      if (answers.length === 0) return;
      await client.courseItemSurveyAnswer.createMany({
        data: answers.map((answer) => ({
          responseId,
          questionId: answer.questionId,
          ratingValue: answer.ratingValue,
          textValue: answer.textValue,
        })),
      });
    },

    async upsertItemView(input) {
      await client.courseItemView.upsert({
        where: {
          courseItemId_userId: {
            courseItemId: input.courseItemId,
            userId: input.userId,
          },
        },
        create: {
          courseItemId: input.courseItemId,
          userId: input.userId,
          progressPercent: 100,
          maxPageSeen: 1,
          totalPages: 1,
          viewedAt: input.viewedAt,
        },
        update: {
          progressPercent: 100,
          maxPageSeen: 1,
          totalPages: 1,
          viewedAt: input.viewedAt,
        },
      });
    },

    async createCourseResponse(input) {
      const response = await client.courseSurveyResponse.create({
        data: {
          templateId: input.templateId,
          courseId: input.courseId,
          userId: input.userId,
        },
        select: { id: true },
      });
      return response;
    },

    async createCourseAnswers(responseId, answers) {
      await client.courseSurveyAnswer.deleteMany({
        where: { responseId },
      });
      if (answers.length === 0) return;
      await client.courseSurveyAnswer.createMany({
        data: answers.map((answer) => ({
          responseId,
          questionId: answer.questionId,
          ratingValue: answer.ratingValue,
          textValue: answer.textValue,
        })),
      });
    },

    async recordEffects(effects) {
      if (!effects.audit) return;
      const audit = effects.audit;
      await client.auditLogEvent.create({
        data: {
          actorId: audit.actorId,
          actorLogin: audit.actorLogin,
          actorName: audit.actorName,
          action: audit.action,
          objectType: audit.objectType,
          objectId: audit.objectId,
          objectLabel: audit.objectLabel,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
          metadataJson:
            audit.metadata === undefined
              ? null
              : JSON.stringify(audit.metadata),
        },
      });
    },
  };
}

export const prismaSurveySubmissionRepository: SurveySubmissionRepository = {
  isUserAssignedToCourse(userId, courseId) {
    return isUserAssignedToCourse(userId, courseId);
  },

  async loadItemSurveyContext(courseId, itemId, userId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        status: true,
        navigationMode: true,
        quizGateMode: true,
        owner: {
          select: { name: true, email: true, firstName: true },
        },
        items: {
          where: { archivedAt: null },
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            moduleId: true,
            orderIndex: true,
            type: true,
            title: true,
            content: true,
            fileUrl: true,
            totalSlides: true,
            isRequired: true,
            module: {
              select: {
                id: true,
                title: true,
                description: true,
                orderIndex: true,
              },
            },
            views: {
              where: { userId },
              select: { progressPercent: true, viewedAt: true },
              take: 1,
            },
            quiz: {
              select: {
                id: true,
                description: true,
                maxAttempts: true,
                minCorrectAnswers: true,
                lockMaterialsOnStart: true,
                questions: {
                  where: { archivedAt: null },
                  select: { id: true },
                },
                attempts: {
                  where: { userId },
                  select: {
                    id: true,
                    outcome: true,
                    correctAnswers: true,
                    attemptNumber: true,
                    score: true,
                    maxScore: true,
                    completedAt: true,
                  },
                },
              },
            },
            surveyTemplate: {
              include: {
                questions: { orderBy: { orderIndex: "asc" } },
              },
            },
          },
        },
      },
    });
    if (!course) return null;

    const surveyItemRow = course.items.find((item) => item.id === itemId);
    const surveyItem = surveyItemRow?.surveyTemplate
      ? {
          id: surveyItemRow.id,
          title: surveyItemRow.title,
          templateId: surveyItemRow.surveyTemplate.id,
          templateTitle: surveyItemRow.surveyTemplate.title,
          templateIsActive: surveyItemRow.surveyTemplate.isActive,
          questions: surveyItemRow.surveyTemplate.questions.map((question) => ({
            id: question.id,
            title: question.title,
            type: question.type,
            optionsJson: question.optionsJson,
            isRequired: question.isRequired,
          })),
        }
      : null;

    // Отбрасываем поле surveyTemplate внутри items — в контексте оно
    // отдельным полем surveyItem.
    const items = course.items.map((item) => ({
      id: item.id,
      moduleId: item.moduleId,
      orderIndex: item.orderIndex,
      type: item.type,
      title: item.title,
      content: item.content,
      fileUrl: item.fileUrl,
      totalSlides: item.totalSlides,
      isRequired: item.isRequired,
      module: item.module,
      views: item.views,
      quiz: item.quiz,
    }));

    return {
      course: {
        id: course.id,
        title: course.title,
        status: course.status,
        navigationMode: course.navigationMode,
        quizGateMode: course.quizGateMode,
        owner: course.owner,
      },
      items,
      surveyItem,
    };
  },

  async loadCourseSurveyContext(courseId, userId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        quizGateMode: true,
        owner: {
          select: { name: true, email: true, firstName: true },
        },
        items: {
          where: { archivedAt: null },
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            type: true,
            title: true,
            isRequired: true,
            views: {
              where: { userId },
              select: { progressPercent: true },
              take: 1,
            },
            quiz: {
              select: {
                maxAttempts: true,
                minCorrectAnswers: true,
                attempts: {
                  where: { userId },
                  select: {
                    outcome: true,
                    correctAnswers: true,
                    attemptNumber: true,
                    score: true,
                    completedAt: true,
                  },
                },
              },
            },
          },
        },
        surveyTemplate: {
          include: {
            questions: { orderBy: { orderIndex: "asc" } },
          },
        },
      },
    });
    if (!course) return null;

    return {
      course: {
        id: course.id,
        title: course.title,
        quizGateMode: course.quizGateMode,
        owner: course.owner,
      },
      items: course.items,
      surveyTemplate: course.surveyTemplate
        ? {
            id: course.surveyTemplate.id,
            title: course.surveyTemplate.title,
            isActive: course.surveyTemplate.isActive,
            questions: course.surveyTemplate.questions.map((question) => ({
              id: question.id,
              title: question.title,
              type: question.type,
              optionsJson: question.optionsJson,
              isRequired: question.isRequired,
            })),
          }
        : null,
    };
  },

  async loadLearner(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, login: true },
    });
    return user;
  },

  async hasItemResponse(courseItemId, userId) {
    const row = await prisma.courseItemSurveyResponse.findUnique({
      where: { courseItemId_userId: { courseItemId, userId } },
      select: { id: true },
    });
    return Boolean(row);
  },

  async hasCourseResponse(courseId, userId) {
    const row = await prisma.courseSurveyResponse.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { id: true },
    });
    return Boolean(row);
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
