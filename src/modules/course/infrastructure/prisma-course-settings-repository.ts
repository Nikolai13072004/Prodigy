import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  CourseSettingsRepository,
  CourseSettingsTransaction,
} from "../application/ports";

function createTransaction(client: Prisma.TransactionClient): CourseSettingsTransaction {
  return {
    loadDetails(courseId) {
      return client.course.findUnique({
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
          resultViewMode: true,
        },
      });
    },
    async updateDetails(courseId, details) {
      await client.course.update({ where: { id: courseId }, data: details });
    },
    loadTitle(courseId) {
      return client.course.findUnique({
        where: { id: courseId },
        select: { id: true, title: true },
      });
    },
    async updateTitle(courseId, title) {
      await client.course.update({ where: { id: courseId }, data: { title } });
    },
    async loadProgression(courseId) {
      const course = await client.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          navigationMode: true,
          completionMode: true,
          quizGateMode: true,
          statusFormat: true,
          gradedItemIdsJson: true,
          items: {
            where: { archivedAt: null },
            orderBy: { orderIndex: "asc" },
            select: { id: true, type: true },
          },
        },
      });
      return course;
    },
    async updateProgression(courseId, plan) {
      await client.course.update({
        where: { id: courseId },
        data: {
          navigationMode: plan.navigationMode,
          quizGateMode: plan.quizGateMode,
          completionMode: plan.completionMode,
          statusFormat: plan.statusFormat,
          gradedItemIdsJson: plan.gradedItemIds.length ? JSON.stringify(plan.gradedItemIds) : null,
        },
      });
      await client.courseItem.updateMany({
        where: { courseId, archivedAt: null },
        data: { isRequired: false },
      });
      if (plan.requiredItemIds.length > 0) {
        await client.courseItem.updateMany({
          where: { courseId, id: { in: plan.requiredItemIds }, archivedAt: null },
          data: { isRequired: true },
        });
      }
    },
    async markContentChanged(courseId) {
      await client.course.updateMany({
        where: { id: courseId, status: "PUBLISHED" },
        data: { hasUnpublishedChanges: true },
      });
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

export const prismaCourseSettingsRepository: CourseSettingsRepository = {
  transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
