export type CoursePublicationCandidate = {
  title: string;
  description: string | null;
  moduleCount: number;
  affectedAudienceCount: number;
  items: Array<{
    type: string;
    title: string;
    moduleId: string | null;
    contentIsMeaningful: boolean;
    fileUrl: string | null;
    totalSlides: number | null;
    quizQuestionCount: number;
    surveyQuestionCount: number;
  }>;
};

export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export class CourseLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseLifecycleError";
  }
}

export function planCourseStatusChange(args: {
  currentStatus: string;
  nextStatus: string;
  confirmedAssignedImpact: boolean;
  candidate: CoursePublicationCandidate;
}) {
  const nextStatus = parseCourseStatus(args.nextStatus);
  if (nextStatus === "PUBLISHED") {
    const validationError = validateCoursePublication(args.candidate);
    if (validationError) throw new CourseLifecycleError(validationError);
  }
  if (
    nextStatus === "DRAFT" &&
    args.currentStatus === "PUBLISHED" &&
    !args.confirmedAssignedImpact &&
    args.candidate.affectedAudienceCount > 0
  ) {
    throw new CourseLifecycleError(
      "Возврат в черновик скроет курс от назначенных учеников. Подтвердите действие повторно.",
    );
  }
  return nextStatus;
}

export function validateCoursePublication(course: CoursePublicationCandidate) {
  if (!course.title.trim() || !course.description?.trim()) {
    return "Для публикации обязательны название и описание курса";
  }
  if (course.items.length === 0) {
    return "Пустой курс нельзя публиковать: добавьте хотя бы один материал";
  }
  if (course.moduleCount === 0 && course.items.every((item) => !item.moduleId)) {
    return "Перед публикацией создайте хотя бы один раздел и добавьте в него материалы";
  }
  for (const item of course.items) {
    if (item.type === "TEXT" && !item.contentIsMeaningful) {
      return `Заполните текст материала «${item.title}»`;
    }
    if ((item.type === "PDF" || item.type === "VIDEO") && !item.fileUrl) {
      return `Для материала «${item.title}» требуется файл или ссылка`;
    }
    if (item.type === "PDF" && (!item.totalSlides || item.totalSlides < 1)) {
      return `Для презентации «${item.title}» укажите количество слайдов`;
    }
    if (item.type === "QUIZ" && item.quizQuestionCount === 0) {
      return "Каждый тест должен содержать хотя бы один вопрос";
    }
    if (item.type === "SURVEY" && item.surveyQuestionCount === 0) {
      return "Каждый опрос должен содержать хотя бы один вопрос";
    }
  }
  return null;
}

function parseCourseStatus(value: string): CourseStatus {
  if (value === "DRAFT" || value === "PUBLISHED" || value === "ARCHIVED") return value;
  throw new CourseLifecycleError("Неверный статус курса");
}
