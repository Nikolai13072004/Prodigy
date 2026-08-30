import type { EnrollmentAccessRepository } from "@/modules/enrollment/application/ports";
import { resolveEnrollmentAccess } from "@/modules/enrollment/domain/enrollment-access";

export function createGetCourseEnrollmentAccess(repository: EnrollmentAccessRepository) {
  return async function getCourseEnrollmentAccess(args: {
    courseId: string;
    userId: string;
    now?: Date;
  }) {
    const assignments = await repository.findAssignments(args.courseId, args.userId);
    return resolveEnrollmentAccess({ ...assignments, now: args.now });
  };
}
