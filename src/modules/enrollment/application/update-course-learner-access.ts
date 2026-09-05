import { resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import { planCourseAccessExpiry } from "../domain/course-access-update";
import { EnrollmentApplicationError } from "./errors";
import type {
  CourseHead,
  LearnerAccessAudit,
  LearnerAccessRepository,
  LearnerHead,
} from "./learner-access-ports";

// Use-case: изменение окна доступа одного ученика к курсу
// (продлить / установить дату / сделать бессрочным).
// Планировщик — доменная функция planCourseAccessExpiry.

export type UpdateCourseLearnerAccessMode = "UNLIMITED" | "EXTEND" | "SET_DATE";

export type UpdateCourseLearnerAccessAuditContext = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type UpdateCourseLearnerAccessCommand = {
  courseId: string;
  learnerId: string;
  mode: UpdateCourseLearnerAccessMode;
  requestedExpiresAt: Date | null;
  days: number;
  now: Date;
  audit: UpdateCourseLearnerAccessAuditContext;
  // Транспорт сообщает, поставилось ли письмо о продлении в очередь: use-case
  // отражает это в аудите. Само enqueue — уже вне use-case.
  accessEmailQueued: boolean;
};

export type UpdateCourseLearnerAccessResult = {
  course: CourseHead;
  learner: LearnerHead;
  previousAccessLabel: string;
  nextAccessLabel: string;
  nextExpiresAt: Date | null;
  previousExpiresAt: Date | null;
  message: string;
};

export type UpdateCourseLearnerAccessDeps = {
  repository: LearnerAccessRepository;
};

function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function describeAccessLabel(
  window: {
    expiresAt: Date | null;
    isUnlimited: boolean;
    state: "active" | "expired";
  } | null,
) {
  if (!window) return "Нет доступа";
  if (window.isUnlimited || !window.expiresAt) return "Бессрочно";
  const label = `До ${formatDateRu(window.expiresAt)}`;
  return window.state === "expired" ? `${label} (истек)` : label;
}

export function createUpdateCourseLearnerAccess(
  deps: UpdateCourseLearnerAccessDeps,
) {
  const { repository } = deps;

  return async function updateCourseLearnerAccess(
    command: UpdateCourseLearnerAccessCommand,
  ): Promise<UpdateCourseLearnerAccessResult> {
    const course = await repository.loadCourseHead(command.courseId);
    if (!course) {
      throw new EnrollmentApplicationError(
        "COURSE_NOT_FOUND",
        "Курс не найден",
      );
    }
    const [learner] = await repository.loadLearners([command.learnerId]);
    if (!learner) {
      // Оригинал не бросал — молча продолжал; но без ученика описать доступ
      // не за что. Здесь фиксируем явную ошибку домена.
      throw new EnrollmentApplicationError(
        "USER_NOT_FOUND",
        "Пользователь не найден.",
      );
    }

    const expiriesMap = await repository.loadLearnerAccessExpiries(
      command.courseId,
      [command.learnerId],
    );
    const expiries = expiriesMap.get(command.learnerId) ?? {
      direct: [],
      group: [],
    };
    const accessWindow = resolveEffectiveCourseAccessWindow(
      expiries.direct,
      expiries.group,
      command.now,
    );
    if (!accessWindow) {
      throw new EnrollmentApplicationError(
        "NO_ASSIGNMENT",
        "У ученика нет назначений на этот курс.",
      );
    }
    const previousAccessLabel = describeAccessLabel(accessWindow);

    const plan = planCourseAccessExpiry({
      mode: command.mode,
      accessWindow,
      requestedExpiresAt: command.requestedExpiresAt,
      days: command.days,
      now: command.now,
    });
    if (plan.action === "skip") {
      throw new EnrollmentApplicationError(
        "ALREADY_UNLIMITED",
        "У ученика уже бессрочный доступ.",
      );
    }
    const nextExpiresAt = plan.expiresAt;

    let message: string;
    if (nextExpiresAt === null) {
      message = "Доступ сделан бессрочным.";
    } else {
      const verb = command.mode === "SET_DATE" ? "установлен" : "продлен";
      message =
        accessWindow.state === "expired"
          ? `Доступ восстановлен до ${formatDateRu(nextExpiresAt)}.`
          : `Доступ ${verb} до ${formatDateRu(nextExpiresAt)}.`;
    }

    const nextAccessWindow = resolveEffectiveCourseAccessWindow(
      [nextExpiresAt],
      expiries.group,
      command.now,
    );
    const nextAccessLabel = describeAccessLabel(nextAccessWindow);
    message = `${message} Было: ${previousAccessLabel}. Стало: ${nextAccessLabel}.`;

    await repository.transact(async (tx) => {
      await tx.upsertLearnerAssignments(
        command.courseId,
        command.audit.actorId,
        [{ learnerId: command.learnerId, expiresAt: nextExpiresAt }],
      );

      const audit: LearnerAccessAudit = {
        actorId: command.audit.actorId,
        actorLogin: command.audit.actorLogin,
        actorName: command.audit.actorName,
        action: "courses:update_access",
        objectType: "course_assignment",
        objectId: `${command.courseId}:${command.learnerId}`,
        objectLabel: command.learnerId,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          courseId: command.courseId,
          learnerId: command.learnerId,
          mode: command.mode,
          expiresAt: nextExpiresAt,
          previousExpiresAt: accessWindow.expiresAt?.toISOString() ?? null,
          nextExpiresAt: nextAccessWindow?.expiresAt?.toISOString() ?? null,
          previousAccessLabel,
          nextAccessLabel,
          accessEmailQueued: command.accessEmailQueued,
          message,
        },
      };
      await tx.recordEffects({ audit });
    });

    return {
      course,
      learner,
      previousAccessLabel,
      nextAccessLabel,
      nextExpiresAt,
      previousExpiresAt: accessWindow.expiresAt ?? null,
      message,
    };
  };
}
