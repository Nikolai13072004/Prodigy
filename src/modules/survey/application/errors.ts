export type SurveyApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "INTRO_IMAGE_BUSY"
  | "ITEM_NOT_SURVEY"
  | "REUSABLE_NOT_FOUND";

export class SurveyApplicationError extends Error {
  constructor(
    readonly code: SurveyApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SurveyApplicationError";
  }
}
