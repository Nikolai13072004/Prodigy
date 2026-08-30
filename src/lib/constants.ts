export const COURSE_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const RESULT_VIEW_MODES = [
  "SCORE_ONLY",
  "SCORE_WITH_ANSWERS",
  "FULL_REVIEW",
] as const;
export type ResultViewMode = (typeof RESULT_VIEW_MODES)[number];

export const COURSE_NAVIGATION_MODES = ["FREE", "SEQUENTIAL"] as const;
export type CourseNavigationMode = (typeof COURSE_NAVIGATION_MODES)[number];
export const COURSE_QUIZ_GATE_MODES = ["RESOLVED", "PASSED"] as const;
export type CourseQuizGateMode = (typeof COURSE_QUIZ_GATE_MODES)[number];
export const PRESENTATION_VIEW_MODES = ["PDF_PREVIEW", "PPTX_HTML5"] as const;
export type PresentationViewMode = (typeof PRESENTATION_VIEW_MODES)[number];

export const COURSE_COMPLETION_MODES = ["ALL_ITEMS", "REQUIRED_ITEMS"] as const;
export type CourseCompletionMode = (typeof COURSE_COMPLETION_MODES)[number];

export const COURSE_STATUS_FORMATS = ["COMPLETED_ONLY", "PASSED_WITH_SCORE"] as const;
export type CourseStatusFormat = (typeof COURSE_STATUS_FORMATS)[number];

export const COURSE_ITEM_TYPES = ["TEXT", "VIDEO", "PDF", "QUIZ", "SURVEY"] as const;
export type CourseItemType = (typeof COURSE_ITEM_TYPES)[number];

export const QUESTION_TYPES = ["SINGLE_CHOICE", "OPEN", "MATCHING", "FILE"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ATTEMPT_OUTCOMES = ["IN_PROGRESS", "PENDING_REVIEW", "ATTEMPTED", "PASSED", "FAILED"] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

export const COURSE_FEEDBACK_STATUSES = ["PUBLISHED", "PENDING"] as const;
export type CourseFeedbackStatus = (typeof COURSE_FEEDBACK_STATUSES)[number];

export const COURSE_ITEM_LABELS: Record<CourseItemType, string> = {
  TEXT: "Текст",
  VIDEO: "Видео",
  PDF: "PDF",
  QUIZ: "Тест",
  SURVEY: "Опрос",
};

export const QUESTION_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Один вариант",
  OPEN: "Открытый ответ",
  MATCHING: "Соответствие",
  FILE: "Файл",
};

export const RESULT_VIEW_MODE_LABELS: Record<ResultViewMode, string> = {
  SCORE_ONLY: "Только балл",
  SCORE_WITH_ANSWERS: "Балл и правильные ответы",
  FULL_REVIEW: "Полный разбор",
};

export const COURSE_NAVIGATION_MODE_LABELS: Record<CourseNavigationMode, string> = {
  FREE: "Свободная навигация",
  SEQUENTIAL: "Последовательное прохождение",
};

export const COURSE_QUIZ_GATE_MODE_LABELS: Record<CourseQuizGateMode, string> = {
  RESOLVED: "После завершения теста",
  PASSED: "Только после успешной сдачи",
};

export const PRESENTATION_VIEW_MODE_LABELS: Record<PresentationViewMode, string> = {
  PDF_PREVIEW: "PDF-превью",
  PPTX_HTML5: "HTML5-плеер",
};

export function normalizePresentationViewMode(
  value: string | null | undefined
): PresentationViewMode {
  return PRESENTATION_VIEW_MODES.includes(value as PresentationViewMode)
    ? (value as PresentationViewMode)
    : "PDF_PREVIEW";
}

export const COURSE_COMPLETION_MODE_LABELS: Record<CourseCompletionMode, string> = {
  ALL_ITEMS: "Пройти все материалы",
  REQUIRED_ITEMS: "Пройти указанные материалы",
};

export const COURSE_STATUS_FORMAT_LABELS: Record<CourseStatusFormat, string> = {
  COMPLETED_ONLY: "Завершен / Не завершен",
  PASSED_WITH_SCORE: "Пройден / Не пройден (x% набрано)",
};

export const ATTEMPT_OUTCOME_LABELS: Record<AttemptOutcome, string> = {
  IN_PROGRESS: "В работе",
  PENDING_REVIEW: "На проверке",
  ATTEMPTED: "Не пройден",
  PASSED: "Пройден",
  FAILED: "Не пройден",
};

export const COURSE_FEEDBACK_STATUS_LABELS: Record<CourseFeedbackStatus, string> = {
  PUBLISHED: "Опубликован",
  PENDING: "На модерации",
};
