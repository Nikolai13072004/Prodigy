// Ошибки use-case создания курса. Разделены с обычными Course-ошибками
// (lifecycle/settings), чтобы транспорт различал ситуации создания —
// у него другие redirect-цели (/courses/new с draft-параметрами формы).

export type CourseCreationApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "SOURCE_NOT_FOUND";

export class CourseCreationApplicationError extends Error {
  constructor(
    readonly code: CourseCreationApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CourseCreationApplicationError";
  }
}
