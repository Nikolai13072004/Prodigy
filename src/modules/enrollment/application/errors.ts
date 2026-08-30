export class EnrollmentApplicationError extends Error {
  constructor(
    readonly code: "COURSE_NOT_FOUND" | "COURSE_NOT_PUBLISHED",
    message: string,
  ) {
    super(message);
    this.name = "EnrollmentApplicationError";
  }
}
