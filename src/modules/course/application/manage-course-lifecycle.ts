import { CourseApplicationError } from "./errors";
import type { CourseAuditActor } from "./ports";
import type { CourseLifecycleRepository } from "./lifecycle-ports";
import { CourseLifecycleError, planCourseStatusChange } from "../domain/course-lifecycle";

export function createManageCourseLifecycle(repository: CourseLifecycleRepository) {
  return {
    changeStatus(command: {
      courseId: string;
      nextStatus: string;
      confirmedAssignedImpact: boolean;
      actor: CourseAuditActor;
      now?: Date;
    }) {
      return repository.transact(async (transaction) => {
        const course = await transaction.load(command.courseId);
        if (!course) throw new CourseApplicationError("COURSE_NOT_FOUND", "Курс не найден");
        let status;
        try {
          status = planCourseStatusChange({
            currentStatus: course.status,
            nextStatus: command.nextStatus,
            confirmedAssignedImpact: command.confirmedAssignedImpact,
            candidate: course,
          });
        } catch (error) {
          if (error instanceof CourseLifecycleError) {
            throw new CourseApplicationError("INVALID_INPUT", error.message);
          }
          throw error;
        }
        const now = command.now ?? new Date();
        await transaction.changeStatus({
          courseId: command.courseId,
          status,
          ...(status === "PUBLISHED"
            ? {
                publishedAt: now,
                publishedSnapshotJson: course.publishedSnapshotJson,
                hasUnpublishedChanges: false,
              }
            : status === "DRAFT"
              ? { publishedAt: null }
              : {}),
        });
        await transaction.recordAudit({
          actor: command.actor,
          action: "courses:update_status",
          courseId: command.courseId,
          courseTitle: course.title,
          metadata: { previousStatus: course.status, nextStatus: status },
        });
        return { status };
      });
    },

    delete(command: { courseId: string; actor: CourseAuditActor }) {
      return repository.transact(async (transaction) => {
        const course = await transaction.loadIdentity(command.courseId);
        if (!course) throw new CourseApplicationError("COURSE_NOT_FOUND", "Курс не найден");
        await transaction.delete(command.courseId);
        await transaction.recordAudit({
          actor: command.actor,
          action: "courses:delete",
          courseId: command.courseId,
          courseTitle: course.title,
          metadata: { status: course.status },
        });
      });
    },
  };
}
