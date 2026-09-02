// Отдельный класс ошибок для quiz-builder. Не смешиваем с
// AssessmentApplicationError (там коды из delivery-домена), чтобы не
// пересекать роли: builder ловит валидацию форм, delivery — политики попыток.

export type QuizBuilderApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "QUIZ_NOT_FOUND"
  | "QUESTION_NOT_FOUND";

export class QuizBuilderApplicationError extends Error {
  constructor(
    readonly code: QuizBuilderApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuizBuilderApplicationError";
  }
}
