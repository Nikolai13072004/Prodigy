import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCourseProgress } from "@/lib/course-progress";
import type {
  CourseFeedbackRepository,
  CourseFeedbackTransaction,
} from "../application/course-feedback-ports";

function createTransaction(
  client: Prisma.TransactionClient,
): CourseFeedbackTransaction {
  return {
    async upsertFeedback(input) {
      await client.courseFeedback.upsert({
        where: {
          courseId_userId: { courseId: input.courseId, userId: input.userId },
        },
        create: {
          courseId: input.courseId,
          userId: input.userId,
          rating: input.rating,
          status: input.status,
          comment: input.comment,
        },
        update: {
          rating: input.rating,
          status: input.status,
          comment: input.comment,
        },
      });
    },
    async deleteFeedback(id) {
      await client.courseFeedback.delete({ where: { id } });
    },
    async publishFeedback(id) {
      await client.courseFeedback.update({
        where: { id },
        data: { status: "PUBLISHED" },
      });
    },
    async recordEffects({ audit }) {
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
            audit.metadata === undefined ? null : JSON.stringify(audit.metadata),
        },
      });
    },
  };
}

export const prismaCourseFeedbackRepository: CourseFeedbackRepository = {
  async getCompletionPercent(courseId, userId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        quizGateMode: true,
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
                timeLimitMinutes: true,
                shuffleQuestions: true,
                shuffleAnswers: true,
                lockMaterialsOnStart: true,
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
      },
    });
    if (!course) return null;

    const progress = getCourseProgress({
      quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
      items: course.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        isRequired: item.isRequired,
        viewed: item.type === "QUIZ" ? false : item.views.length > 0,
        materialProgress:
          item.type === "QUIZ" ? 0 : item.views[0]?.progressPercent ?? 0,
        quiz: item.quiz,
      })),
    });
    return progress.percent;
  },

  async findMyFeedback(courseId, userId) {
    const feedback = await prisma.courseFeedback.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: {
        id: true,
        rating: true,
        comment: true,
        course: { select: { title: true } },
      },
    });
    if (!feedback) return null;
    return {
      id: feedback.id,
      rating: feedback.rating,
      comment: feedback.comment,
      courseTitle: feedback.course.title,
    };
  },

  async findModeration(courseId, feedbackId) {
    const feedback = await prisma.courseFeedback.findFirst({
      where: { id: feedbackId, courseId },
      select: {
        id: true,
        status: true,
        userId: true,
        course: { select: { id: true, title: true } },
        user: { select: { name: true, login: true } },
      },
    });
    if (!feedback) return null;
    return {
      id: feedback.id,
      status: feedback.status,
      courseId: feedback.course.id,
      learnerId: feedback.userId,
      learnerName: feedback.user.name,
      learnerLogin: feedback.user.login,
      courseTitle: feedback.course.title,
    };
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
