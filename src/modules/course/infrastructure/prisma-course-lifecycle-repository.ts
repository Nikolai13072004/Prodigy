import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildPublishedCourseSnapshot } from "@/lib/course-content";
import { hasMeaningfulRichText } from "@/lib/rich-text";
import type {
  CourseLifecycleRepository,
  CourseLifecycleTransaction,
} from "../application/lifecycle-ports";

function createTransaction(client: Prisma.TransactionClient): CourseLifecycleTransaction {
  return {
    async load(courseId) {
      const course = await client.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          description: true,
          requirements: true,
          targetAudience: true,
          category: true,
          difficultyLevel: true,
          durationMinutes: true,
          tagsJson: true,
          thumbnailUrl: true,
          coverUrl: true,
          navigationMode: true,
          quizGateMode: true,
          completionMode: true,
          statusFormat: true,
          gradedItemIdsJson: true,
          resultViewMode: true,
          status: true,
          modules: {
            where: { archivedAt: null },
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              orderIndex: true,
              archivedAt: true,
            },
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
              presentationViewMode: true,
              isRequired: true,
              archivedAt: true,
              quiz: {
                select: {
                  id: true,
                  description: true,
                  maxAttempts: true,
                  minCorrectAnswers: true,
                  timeLimitMinutes: true,
                  shuffleQuestions: true,
                  shuffleAnswers: true,
                  lockMaterialsOnStart: true,
                  questionPoolSize: true,
                  retryDelayMinutes: true,
                  trackSecurityEvents: true,
                  questions: {
                    where: { archivedAt: null },
                    orderBy: { orderIndex: "asc" },
                    select: {
                      id: true,
                      orderIndex: true,
                      type: true,
                      prompt: true,
                      config: true,
                      points: true,
                      archivedAt: true,
                    },
                  },
                },
              },
              surveyTemplate: {
                select: { questions: { select: { id: true } } },
              },
            },
          },
          directAssignments: { select: { id: true } },
          groupAssignments: { select: { id: true } },
          invites: { where: { status: "PENDING" }, select: { id: true } },
        },
      });
      if (!course) return null;
      return {
        id: course.id,
        title: course.title,
        description: course.description,
        status: course.status,
        moduleCount: course.modules.length,
        affectedAudienceCount:
          course.directAssignments.length + course.groupAssignments.length + course.invites.length,
        items: course.items.map((item) => ({
          type: item.type,
          title: item.title,
          moduleId: item.moduleId,
          contentIsMeaningful: hasMeaningfulRichText(item.content),
          fileUrl: item.fileUrl,
          totalSlides: item.totalSlides,
          quizQuestionCount: item.quiz?.questions.length ?? 0,
          surveyQuestionCount: item.surveyTemplate?.questions.length ?? 0,
        })),
        publishedSnapshotJson: JSON.stringify(buildPublishedCourseSnapshot(course)),
      };
    },
    loadIdentity(courseId) {
      return client.course.findUnique({
        where: { id: courseId },
        select: { id: true, title: true, status: true },
      });
    },
    async changeStatus(args) {
      await client.course.update({
        where: { id: args.courseId },
        data: {
          status: args.status,
          ...(args.publishedAt !== undefined ? { publishedAt: args.publishedAt } : {}),
          ...(args.publishedSnapshotJson !== undefined
            ? { publishedSnapshotJson: args.publishedSnapshotJson }
            : {}),
          ...(args.hasUnpublishedChanges !== undefined
            ? { hasUnpublishedChanges: args.hasUnpublishedChanges }
            : {}),
        },
      });
    },
    async delete(courseId) {
      await client.course.delete({ where: { id: courseId } });
    },
    async recordAudit(args) {
      await client.auditLogEvent.create({
        data: {
          actorId: args.actor.id,
          actorLogin: args.actor.login,
          actorName: args.actor.name,
          action: args.action,
          objectType: "course",
          objectId: args.courseId,
          objectLabel: args.courseTitle,
          ipAddress: args.actor.ipAddress,
          userAgent: args.actor.userAgent,
          metadataJson: JSON.stringify(args.metadata),
        },
      });
    },
  };
}

export const prismaCourseLifecycleRepository: CourseLifecycleRepository = {
  transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
