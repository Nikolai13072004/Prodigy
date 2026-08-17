export const COURSE_CATEGORY_OPTIONS = [
  { value: "FINANCE", label: "Финансы" },
  { value: "ACCOUNTING", label: "Бухгалтерия" },
  { value: "CALCULATION", label: "Расчеты" },
  { value: "HR", label: "HR" },
  { value: "MANAGEMENT", label: "Управление" },
  { value: "GENERAL", label: "Общее обучение" },
] as const;

export type CourseCategory = (typeof COURSE_CATEGORY_OPTIONS)[number]["value"];

export const COURSE_DIFFICULTY_OPTIONS = [
  { value: "BEGINNER", label: "Начальный" },
  { value: "INTERMEDIATE", label: "Средний" },
  { value: "ADVANCED", label: "Продвинутый" },
] as const;

export type CourseDifficultyLevel = (typeof COURSE_DIFFICULTY_OPTIONS)[number]["value"];

const COURSE_CATEGORY_LABELS = Object.fromEntries(
  COURSE_CATEGORY_OPTIONS.map((option) => [option.value, option.label])
) as Record<CourseCategory, string>;

const COURSE_DIFFICULTY_LABELS = Object.fromEntries(
  COURSE_DIFFICULTY_OPTIONS.map((option) => [option.value, option.label])
) as Record<CourseDifficultyLevel, string>;

export function isCourseCategory(value: string): value is CourseCategory {
  return COURSE_CATEGORY_OPTIONS.some((option) => option.value === value);
}

export function isCourseDifficultyLevel(value: string): value is CourseDifficultyLevel {
  return COURSE_DIFFICULTY_OPTIONS.some((option) => option.value === value);
}

export function getCourseCategoryLabel(value: string | null | undefined) {
  return value && isCourseCategory(value) ? COURSE_CATEGORY_LABELS[value] : "Не указана";
}

export function getCourseDifficultyLabel(value: string | null | undefined) {
  return value && isCourseDifficultyLevel(value) ? COURSE_DIFFICULTY_LABELS[value] : "Не указан";
}

export function formatCourseDuration(value: number | null | undefined) {
  if (!Number.isInteger(value) || !value || value < 1) return "Не указана";

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);

  return parts.join(" ");
}

export function splitCourseDurationMinutes(value: number | null | undefined) {
  if (!Number.isInteger(value) || !value || value < 1) {
    return { hours: 1, minutes: 0 };
  }

  return {
    hours: Math.floor(value / 60),
    minutes: value % 60,
  };
}
