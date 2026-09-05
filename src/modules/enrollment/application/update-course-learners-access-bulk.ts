import { resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import { planCourseAccessExpiry } from "../domain/course-access-update";
import { EnrollmentApplicationError } from "./errors";
import type {
  LearnerAccessAudit,
  LearnerAccessRepository,
  UpsertLearnerAssignmentInput,
} from "./learner-access-ports";

// Use-case: массовое изменение окна доступа группы учеников к одному курсу.
// Планировщик каждого ученика — та же planCourseAccessExpiry. Всё делается
// одной транзакцией: батч upsert + один запись аудита.

export type BulkAccessMode = "UNLIMITED" | "EXTEND" | "SET_DATE";

export type BulkAccessScope = "selected" | "filtered";

export type UpdateBulkAccessAuditContext = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type UpdateCourseLearnersAccessBulkCommand = {
  courseId: string;
  learnerIds: string[];
  mode: BulkAccessMode;
  requestedExpiresAt: Date | null;
  days: number;
  scope: BulkAccessScope;
  now: Date;
  audit: UpdateBulkAccessAuditContext;
};

export type UpdateCourseLearnersAccessBulkResult = {
  updatedLearnerIds: string[];
  learnersWithoutAssignments: number;
  learnersWithUnlimitedAccess: number;
};

export type UpdateCourseLearnersAccessBulkDeps = {
  repository: LearnerAccessRepository;
};

export function createUpdateCourseLearnersAccessBulk(
  deps: UpdateCourseLearnersAccessBulkDeps,
) {
  const { repository } = deps;

  return async function updateCourseLearnersAccessBulk(
    command: UpdateCourseLearnersAccessBulkCommand,
  ): Promise<UpdateCourseLearnersAccessBulkResult> {
    const course = await repository.loadCourseHead(command.courseId);
    if (!course) {
      throw new EnrollmentApplicationError(
        "COURSE_NOT_FOUND",
        "Курс не найден",
      );
    }

    const expiriesMap = await repository.loadLearnerAccessExpiries(
      command.courseId,
      command.learnerIds,
    );

    const updates: UpsertLearnerAssignmentInput[] = [];
    let learnersWithoutAssignments = 0;
    let learnersWithUnlimitedAccess = 0;

    for (const learnerId of command.learnerIds) {
      const expiries = expiriesMap.get(learnerId) ?? {
        direct: [],
        group: [],
      };
      const accessWindow = resolveEffectiveCourseAccessWindow(
        expiries.direct,
        expiries.group,
        command.now,
      );

      const plan = planCourseAccessExpiry({
        mode: command.mode,
        accessWindow,
        requestedExpiresAt: command.requestedExpiresAt,
        days: command.days,
        now: command.now,
      });
      if (plan.action === "skip") {
        if (plan.reason === "NOT_ASSIGNED") learnersWithoutAssignments += 1;
        else learnersWithUnlimitedAccess += 1;
        continue;
      }
      updates.push({ learnerId, expiresAt: plan.expiresAt });
    }

    if (updates.length === 0) {
      // Ничего к применению — специальный код, транспорт формирует сообщение
      // с деталями по счётчикам.
      const error = new EnrollmentApplicationError(
        "NOTHING_TO_UPDATE",
        "Изменения не применены.",
      );
      // Прикрепляем счётчики в metadata — транспорт умеет их прочитать.
      Object.assign(error, {
        details: {
          learnersWithUnlimitedAccess,
          learnersWithoutAssignments,
        },
      });
      throw error;
    }

    await repository.transact(async (tx) => {
      await tx.upsertLearnerAssignments(
        command.courseId,
        command.audit.actorId,
        updates,
      );

      const audit: LearnerAccessAudit = {
        actorId: command.audit.actorId,
        actorLogin: command.audit.actorLogin,
        actorName: command.audit.actorName,
        action: "courses:bulk_update_access",
        objectType: "course_assignment",
        objectId: command.courseId,
        objectLabel: command.courseId,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          scope: command.scope,
          learnerIds: command.learnerIds,
          updatedLearnerIds: updates.map((update) => update.learnerId),
          mode: command.mode,
          days: command.mode === "EXTEND" ? command.days : null,
          requestedExpiresAt: command.requestedExpiresAt,
          learnersWithoutAssignments,
          learnersWithUnlimitedAccess,
        },
      };
      await tx.recordEffects({ audit });
    });

    return {
      updatedLearnerIds: updates.map((update) => update.learnerId),
      learnersWithoutAssignments,
      learnersWithUnlimitedAccess,
    };
  };
}

// Помощник для транспорта: извлечь счётчики из брошенной ошибки NOTHING_TO_UPDATE.
export function extractBulkAccessSkipDetails(error: unknown) {
  if (error instanceof EnrollmentApplicationError && "details" in error) {
    const details = (error as unknown as { details?: { learnersWithUnlimitedAccess: number; learnersWithoutAssignments: number } }).details;
    return details ?? null;
  }
  return null;
}
