import { planLearnerUnenrollment } from "../domain/unenrollment-plan";
import type { UnenrollmentActor, UnenrollmentRepository } from "./unenroll-ports";

export type UnenrollCourseLearnerCommand = {
  courseId: string;
  learnerId: string;
  actor: UnenrollmentActor;
  deleteProgress: boolean;
  revokeCertificate: boolean;
  now: Date;
};

export type UnenrollCourseLearnerResult =
  | { status: "COURSE_NOT_FOUND" }
  | { status: "NO_ASSIGNMENT" }
  | { status: "DONE"; deletedProgress: boolean; certificateRevoked: boolean };

export function createUnenrollCourseLearner(repository: UnenrollmentRepository) {
  return async function unenrollCourseLearner(
    command: UnenrollCourseLearnerCommand
  ): Promise<UnenrollCourseLearnerResult> {
    const context = await repository.loadContext(command.courseId, command.learnerId);
    if (!context) return { status: "COURSE_NOT_FOUND" };

    const decision = planLearnerUnenrollment({
      hadDirectAssignment: context.hadDirectAssignment,
      hadGroupAssignment: context.hadGroupAssignment,
    });
    if (!decision.valid) return { status: "NO_ASSIGNMENT" };

    // Просроченный override гасит наследованный групповой доступ (на секунду в прошлом).
    const overrideExpiresAt = new Date(command.now.getTime() - 1_000);
    await repository.applyUnenrollment({
      courseId: command.courseId,
      learnerId: command.learnerId,
      actorId: command.actor.id,
      assignmentAction: decision.assignmentAction,
      overrideExpiresAt,
      deleteProgress: command.deleteProgress,
      courseItemIds: context.courseItemIds,
      courseQuizIds: context.courseQuizIds,
    });

    // Сертификат по умолчанию переживает отчисление — аннулируем только по явному флагу.
    let certificateRevoked = false;
    if (command.revokeCertificate) {
      certificateRevoked = await repository.revokeIssuedCertificate({
        courseId: command.courseId,
        learnerId: command.learnerId,
        actorId: command.actor.id,
        now: command.now,
      });
    }

    await repository.recordAudit({
      actor: command.actor,
      courseId: command.courseId,
      learnerId: command.learnerId,
      objectLabel: context.courseTitle,
      hadDirectAssignment: context.hadDirectAssignment,
      hadGroupAssignment: context.hadGroupAssignment,
      deleteProgress: command.deleteProgress,
      certificateRevoked,
      overrideExpiresAt: decision.assignmentAction === "OVERRIDE_EXPIRE" ? overrideExpiresAt : null,
    });

    return { status: "DONE", deletedProgress: command.deleteProgress, certificateRevoked };
  };
}
