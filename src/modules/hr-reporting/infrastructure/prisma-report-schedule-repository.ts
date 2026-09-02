import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  ReportScheduleRepository,
  ReportScheduleTransaction,
} from "../application/manage-report-schedules-ports";

function createTransaction(client: Prisma.TransactionClient): ReportScheduleTransaction {
  return {
    async createSchedule(data) {
      const schedule = await client.hrReportSchedule.create({
        data: {
          createdById: data.createdById,
          reportType: data.reportType,
          courseId: data.courseId,
          recipientsJson: data.recipientsJson,
          nextRunAt: data.nextRunAt,
        },
        select: { id: true },
      });
      return { id: schedule.id };
    },
    async updatePause(scheduleId, isPaused, nextRunAt) {
      await client.hrReportSchedule.update({
        where: { id: scheduleId },
        data: { isPaused, nextRunAt },
      });
    },
    async deleteSchedule(scheduleId) {
      await client.hrReportSchedule.delete({ where: { id: scheduleId } });
    },
    async recordAudit(audit) {
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
          metadataJson: audit.metadata === undefined ? null : JSON.stringify(audit.metadata),
        },
      });
    },
  };
}

export const prismaReportScheduleRepository: ReportScheduleRepository = {
  async findPublishedCourse(courseId) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, status: "PUBLISHED" },
      select: { id: true, title: true },
    });
    return course ?? null;
  },

  async findOwnedSchedule(scheduleId, ownerId) {
    const schedule = await prisma.hrReportSchedule.findFirst({
      where: { id: scheduleId, createdById: ownerId },
      select: {
        id: true,
        reportType: true,
        nextRunAt: true,
        isPaused: true,
        course: { select: { title: true } },
      },
    });
    if (!schedule) return null;
    return {
      id: schedule.id,
      reportType: schedule.reportType,
      courseTitle: schedule.course?.title ?? null,
      nextRunAt: schedule.nextRunAt,
      isPaused: schedule.isPaused,
    };
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
