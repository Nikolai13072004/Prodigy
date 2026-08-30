export class CourseApplicationError extends Error {
  constructor(
    public readonly code:
      | "COURSE_NOT_FOUND"
      | "INVALID_INPUT"
      | "INVALID_PROGRESSION",
    message: string,
  ) {
    super(message);
    this.name = "CourseApplicationError";
  }
}
