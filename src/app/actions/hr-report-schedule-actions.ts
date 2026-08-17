"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";
import {
  getHrReportScheduleType,
  getHrReportScheduleTypeLabel,
  getInitialHrReportScheduleRunAt,
  parseHrReportScheduleRecipients,
} from "@/lib/hr-report-schedules";

function asString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function reportsSchedulesUrl(params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/admin/reports?${query}#report-schedules` : "/admin/reports#report-schedules";
}

export async function createHrReportSchedule(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const reportType = getHrReportScheduleType(formData.get("reportType")?.toString());
  const courseId = asString(formData, "courseId");
  const recipientsInput = asString(formData, "recipients");
  const parsedRecipients = parseHrReportScheduleRecipients(recipientsInput);

  if (!recipientsInput) {
    redirect(reportsSchedulesUrl({ scheduleError: "Укажите хотя бы один email получателя." }));
  }

  if (parsedRecipients.invalid.length > 0) {
    redirect(
      reportsSchedulesUrl({
        scheduleError: `Некорректные email: ${parsedRecipients.invalid.slice(0, 3).join(", ")}.`,
      })
    );
  }

  if (parsedRecipients.recipients.length === 0) {
    redirect(reportsSchedulesUrl({ scheduleError: "Не удалось распознать ни одного корректного email." }));
  }

  if (parsedRecipients.isTrimmed) {
    redirect(
      reportsSchedulesUrl({
        scheduleError: "В одном расписании можно сохранить не более 20 email-адресов.",
      })
    );
  }

  const requiresCourse = reportType === "COURSE_RESULTS" || reportType === "ANSWERS_ANALYSIS";
  const course =
    requiresCourse
      ? await prisma.course.findFirst({
          where: {
            id: courseId,
            status: "PUBLISHED",
          },
          select: {
            id: true,
            title: true,
          },
        })
      : null;

  if (requiresCourse && !course) {
    redirect(
      reportsSchedulesUrl({
        scheduleError: "Для отчета по курсу выберите опубликованный курс из списка.",
      })
    );
  }

  const schedule = await prisma.hrReportSchedule.create({
    data: {
      createdById: session.user.id,
      reportType,
      courseId: course?.id ?? null,
      recipientsJson: JSON.stringify(parsedRecipients.recipients),
      nextRunAt: getInitialHrReportScheduleRunAt(),
    },
    select: {
      id: true,
    },
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "report_schedules:create",
    objectType: "hr_report_schedule",
    objectId: schedule.id,
    objectLabel: getHrReportScheduleTypeLabel(reportType, course?.title ?? null),
    metadata: {
      reportType,
      courseId: course?.id ?? null,
      recipients: parsedRecipients.recipients,
      recipientsCount: parsedRecipients.recipients.length,
    },
  });

  revalidatePath("/admin/reports");
  redirect(reportsSchedulesUrl({ scheduleNotice: "Расписание отчета сохранено." }));
}

export async function toggleHrReportSchedulePause(scheduleId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const mode = asString(formData, "mode") === "resume" ? "resume" : "pause";

  const schedule = await prisma.hrReportSchedule.findFirst({
    where: {
      id: scheduleId,
      createdById: session.user.id,
    },
    select: {
      id: true,
      reportType: true,
      course: {
        select: {
          title: true,
        },
      },
      nextRunAt: true,
      isPaused: true,
    },
  });

  if (!schedule) {
    redirect(reportsSchedulesUrl({ scheduleError: "Расписание не найдено." }));
  }

  const nextRunAt =
    mode === "resume"
      ? schedule.nextRunAt.getTime() > Date.now()
        ? schedule.nextRunAt
        : getInitialHrReportScheduleRunAt()
      : schedule.nextRunAt;

  await prisma.hrReportSchedule.update({
    where: { id: schedule.id },
    data: {
      isPaused: mode === "pause",
      nextRunAt,
    },
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: mode === "pause" ? "report_schedules:pause" : "report_schedules:resume",
    objectType: "hr_report_schedule",
    objectId: schedule.id,
    objectLabel: getHrReportScheduleTypeLabel(getHrReportScheduleType(schedule.reportType), schedule.course?.title ?? null),
    metadata: {
      nextRunAt: nextRunAt.toISOString(),
    },
  });

  revalidatePath("/admin/reports");
  redirect(
    reportsSchedulesUrl({
      scheduleNotice:
        mode === "pause"
          ? "Расписание приостановлено."
          : "Расписание снова активно и будет отправлено по ближайшему ежемесячному циклу.",
    })
  );
}

export async function deleteHrReportSchedule(scheduleId: string) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const schedule = await prisma.hrReportSchedule.findFirst({
    where: {
      id: scheduleId,
      createdById: session.user.id,
    },
    select: {
      id: true,
      reportType: true,
      course: {
        select: {
          title: true,
        },
      },
    },
  });

  if (!schedule) {
    redirect(reportsSchedulesUrl({ scheduleError: "Расписание не найдено." }));
  }

  await prisma.hrReportSchedule.delete({
    where: {
      id: schedule.id,
    },
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "report_schedules:delete",
    objectType: "hr_report_schedule",
    objectId: schedule.id,
    objectLabel: getHrReportScheduleTypeLabel(getHrReportScheduleType(schedule.reportType), schedule.course?.title ?? null),
  });

  revalidatePath("/admin/reports");
  redirect(reportsSchedulesUrl({ scheduleNotice: "Расписание удалено." }));
}
