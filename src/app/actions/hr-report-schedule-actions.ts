"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, getAuditRequestContext } from "@/lib/audit-log";
import { PERMISSIONS } from "@/lib/roles";
import { parseHrReportScheduleRecipients } from "@/lib/hr-report-schedules";
import { ManageReportScheduleError } from "@/modules/hr-reporting/application/manage-report-schedules-errors";
import { reportSchedules } from "@/modules/hr-reporting/server/report-schedules";

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

  try {
    await reportSchedules.create({
      reportType: formData.get("reportType")?.toString() ?? "",
      courseId: asString(formData, "courseId"),
      recipients: parsedRecipients.recipients,
      actor: auditActorFromSessionUser(session.user),
      audit: await getAuditRequestContext(),
    });
  } catch (error) {
    if (error instanceof ManageReportScheduleError) {
      redirect(reportsSchedulesUrl({ scheduleError: error.message }));
    }
    throw error;
  }

  revalidatePath("/admin/reports");
  redirect(reportsSchedulesUrl({ scheduleNotice: "Расписание отчета сохранено." }));
}

export async function toggleHrReportSchedulePause(scheduleId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const mode = asString(formData, "mode") === "resume" ? "resume" : "pause";

  try {
    await reportSchedules.togglePause({
      scheduleId,
      mode,
      actor: auditActorFromSessionUser(session.user),
      audit: await getAuditRequestContext(),
    });
  } catch (error) {
    if (error instanceof ManageReportScheduleError) {
      redirect(reportsSchedulesUrl({ scheduleError: error.message }));
    }
    throw error;
  }

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

  try {
    await reportSchedules.remove({
      scheduleId,
      actor: auditActorFromSessionUser(session.user),
      audit: await getAuditRequestContext(),
    });
  } catch (error) {
    if (error instanceof ManageReportScheduleError) {
      redirect(reportsSchedulesUrl({ scheduleError: error.message }));
    }
    throw error;
  }

  revalidatePath("/admin/reports");
  redirect(reportsSchedulesUrl({ scheduleNotice: "Расписание удалено." }));
}
