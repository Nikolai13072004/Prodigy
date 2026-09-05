export type CourseFeedbackApplicationErrorCode =
  | "COURSE_NOT_FOUND"
  | "NOT_COMPLETE"
  | "VALIDATION_FAILED"
  | "FEEDBACK_NOT_FOUND"
  | "ALREADY_PUBLISHED";

export class CourseFeedbackApplicationError extends Error {
  constructor(
    readonly code: CourseFeedbackApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CourseFeedbackApplicationError";
  }
}
