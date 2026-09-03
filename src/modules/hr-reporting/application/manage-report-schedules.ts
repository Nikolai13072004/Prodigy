import { ManageReportScheduleError } from "./manage-report-schedules-errors";
import type {
  ReportScheduleRepository,
  ScheduleAudit,
} from "./manage-report-schedules-ports";

// Управление расписаниями HR-отчётов. Валидация получателей и redirect'ы —
// в транспорте; здесь проверка курса, вычисление nextRunAt и атомарная запись
// (мутация + аудит). Чистые хелперы типа/лейбла/времени инжектируются из фасада —
// use-case не тянет server-only-зависимости lib/hr-report-schedules.

export type ScheduleActor = { id: string; login: string | null; name: string | null };
export type ScheduleAuditContext = { ipAddress: string | null; userAgent: string | null };

export type ManageReportScheduleDeps = {
  repository: ReportScheduleRepository;
  // Нормализует произвольный ввод к каноническому типу отчёта.
  normalizeReportType: (value: string) => string;
  // Человеко-читаемый лейбл для objectLabel аудита.
  describeReportType: (normalizedType: string, courseTitle: string | null) => string;
  // Момент первого запуска нового расписания.
  initialRunAt: () => Date;
};

function auditBase(
  actor: ScheduleActor,
  context: ScheduleAuditContext,
  action: string,
  objectId: string,
  objectLabel: string,
  metadata: unknown,
): ScheduleAudit {
  return {
    actorId: actor.id,
    actorLogin: actor.login,
    actorName: actor.name,
    action,
    objectType: "hr_report_schedule",
    objectId,
    objectLabel,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata,
  };
}

export type CreateScheduleCommand = {
  reportType: string;
  courseId: string;
  recipients: string[];
  actor: ScheduleActor;
  audit: ScheduleAuditContext;
};

export function createManageReportSchedules(deps: ManageReportScheduleDeps) {
  const { repository, normalizeReportType, describeReportType, initialRunAt } = deps;

  return {
    async create(command: CreateScheduleCommand): Promise<void> {
      const reportType = normalizeReportType(command.reportType);
      const requiresCourse = reportType === "COURSE_RESULTS" || reportType === "ANSWERS_ANALYSIS";

      const course = requiresCourse
        ? await repository.findPublishedCourse(command.courseId)
        : null;
      if (requiresCourse && !course) {
        throw new ManageReportScheduleError(
          "COURSE_REQUIRED",
          "Для отчета по курсу выберите опубликованный курс из списка.",
        );
      }

      await repository.transact(async (tx) => {
        const schedule = await tx.createSchedule({
          createdById: command.actor.id,
          reportType,
          courseId: course?.id ?? null,
          recipientsJson: JSON.stringify(command.recipients),
          nextRunAt: initialRunAt(),
        });
        await tx.recordAudit(
          auditBase(
            command.actor,
            command.audit,
            "report_schedules:create",
            schedule.id,
            describeReportType(reportType, course?.title ?? null),
            {
              reportType,
              courseId: course?.id ?? null,
              recipients: command.recipients,
              recipientsCount: command.recipients.length,
            },
          ),
        );
      });
    },

    async togglePause(command: {
      scheduleId: string;
      mode: "pause" | "resume";
      actor: ScheduleActor;
      audit: ScheduleAuditContext;
    }): Promise<void> {
      const schedule = await repository.findOwnedSchedule(command.scheduleId, command.actor.id);
      if (!schedule) {
        throw new ManageReportScheduleError("NOT_FOUND", "Расписание не найдено.");
      }

      const nextRunAt =
        command.mode === "resume"
          ? schedule.nextRunAt.getTime() > Date.now()
            ? schedule.nextRunAt
            : initialRunAt()
          : schedule.nextRunAt;

      await repository.transact(async (tx) => {
        await tx.updatePause(schedule.id, command.mode === "pause", nextRunAt);
        await tx.recordAudit(
          auditBase(
            command.actor,
            command.audit,
            command.mode === "pause" ? "report_schedules:pause" : "report_schedules:resume",
            schedule.id,
            describeReportType(normalizeReportType(schedule.reportType), schedule.courseTitle),
            { nextRunAt: nextRunAt.toISOString() },
          ),
        );
      });
    },

    async remove(command: {
      scheduleId: string;
      actor: ScheduleActor;
      audit: ScheduleAuditContext;
    }): Promise<void> {
      const schedule = await repository.findOwnedSchedule(command.scheduleId, command.actor.id);
      if (!schedule) {
        throw new ManageReportScheduleError("NOT_FOUND", "Расписание не найдено.");
      }

      await repository.transact(async (tx) => {
        await tx.deleteSchedule(schedule.id);
        await tx.recordAudit(
          auditBase(
            command.actor,
            command.audit,
            "report_schedules:delete",
            schedule.id,
            describeReportType(normalizeReportType(schedule.reportType), schedule.courseTitle),
            undefined,
          ),
        );
      });
    },
  };
}
