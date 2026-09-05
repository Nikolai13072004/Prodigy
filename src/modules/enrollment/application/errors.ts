export type EnrollmentApplicationErrorCode =
  | "COURSE_NOT_FOUND"
  | "COURSE_NOT_PUBLISHED"
  // assignCourseToLearner:
  | "USER_NOT_FOUND"
  | "USER_ARCHIVED"
  | "ALREADY_ASSIGNED"
  // updateCourseLearnerAccess (single):
  | "NO_ASSIGNMENT"
  | "ALREADY_UNLIMITED"
  // bulk update:
  | "NOTHING_TO_UPDATE";

export class EnrollmentApplicationError extends Error {
  constructor(
    readonly code: EnrollmentApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnrollmentApplicationError";
  }
}
