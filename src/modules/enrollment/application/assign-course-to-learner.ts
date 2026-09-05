import { USER_STATUSES } from "@/lib/users";
import { EnrollmentApplicationError } from "./errors";
import type {
  CourseHead,
  LearnerAccessAudit,
  LearnerAccessRepository,
  LearnerHead,
} from "./learner-access-ports";

// Use-case: назначение курса конкретному ученику (с профиля пользователя).
// Правила: курс существует и опубликован, ученик не архивный и ещё не
// имеет активного назначения (истёкшее — не блок, освежается upsert'ом).
// Аудит courses:assign пишется в одной транзакции с апсертом.

export type AssignCourseToLearnerAuditContext = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AssignCourseToLearnerCommand = {
  courseId: string;
  learnerId: string;
  accessExpiresAt: Date | null;
  audit: AssignCourseToLearnerAuditContext;
};

export type AssignCourseToLearnerResult = {
  course: CourseHead;
  learner: LearnerHead;
};

export type AssignCourseToLearnerDeps = {
  repository: LearnerAccessRepository;
};

export function createAssignCourseToLearner(
  deps: AssignCourseToLearnerDeps,
) {
  const { repository } = deps;

  return async function assignCourseToLearner(
    command: AssignCourseToLearnerCommand,
  ): Promise<AssignCourseToLearnerResult> {
    // Чтения вне транзакции — как и раньше; гонка между проверкой «уже
    // назначен» и upsert допустима, upsert идемпотентен по уникальному индексу.
    const [learner] = await repository.loadLearners([command.learnerId]);
    if (!learner) {
      throw new EnrollmentApplicationError(
        "USER_NOT_FOUND",
        "Пользователь не найден.",
      );
    }
    if (learner.status === USER_STATUSES.ARCHIVED) {
      throw new EnrollmentApplicationError(
        "USER_ARCHIVED",
        "Нельзя назначить курс архивному пользователю.",
      );
    }
    const course = await repository.loadCourseHead(command.courseId);
    if (!course || course.status !== "PUBLISHED") {
      throw new EnrollmentApplicationError(
        "COURSE_NOT_PUBLISHED",
        "Для назначения доступны только опубликованные неархивные курсы.",
      );
    }

    const alreadyAssigned = await repository.hasActiveAssignment(
      command.courseId,
      command.learnerId,
    );
    if (alreadyAssigned) {
      throw new EnrollmentApplicationError(
        "ALREADY_ASSIGNED",
        "Курс уже назначен пользователю.",
      );
    }

    await repository.transact(async (tx) => {
      await tx.upsertLearnerAssignments(command.courseId, command.audit.actorId, [
        {
          learnerId: command.learnerId,
          expiresAt: command.accessExpiresAt,
        },
      ]);

      const audit: LearnerAccessAudit = {
        actorId: command.audit.actorId,
        actorLogin: command.audit.actorLogin,
        actorName: command.audit.actorName,
        action: "courses:assign",
        objectType: "course",
        objectId: course.id,
        objectLabel: course.title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          source: "user_profile",
          directUserIds: [command.learnerId],
          accessExpiresAt: command.accessExpiresAt,
        },
      };
      await tx.recordEffects({ audit });
    });

    return { course, learner };
  };
}
