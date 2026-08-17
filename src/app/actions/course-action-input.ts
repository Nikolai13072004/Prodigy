import {
  COURSE_NAVIGATION_MODES,
  normalizePresentationViewMode,
  type PresentationViewMode,
} from "@/lib/constants";
import { isCourseCategory, isCourseDifficultyLevel } from "@/lib/course-metadata";

export function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function asOptionalString(formData: FormData, key: string) {
  return asString(formData, key) || null;
}

export function asPositiveInt(formData: FormData, key: string, fallback = 1) {
  const raw = Number.parseInt(asString(formData, key), 10);
  return Number.isFinite(raw) && raw >= 1 ? raw : fallback;
}

export function asOptionalPositiveInt(formData: FormData, key: string) {
  const raw = asString(formData, key);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

export function parsePresentationViewMode(formData: FormData): PresentationViewMode {
  return normalizePresentationViewMode(asString(formData, "presentationViewMode"));
}

export function parseCourseDurationMinutes(formData: FormData) {
  const hoursRaw = asString(formData, "durationHours");
  const minutesRaw = asString(formData, "durationMinutes");
  if (!hoursRaw && !minutesRaw) return null;
  const hours = hoursRaw ? Number(hoursRaw) : 0;
  const minutes = minutesRaw ? Number(minutesRaw) : 0;
  if (!Number.isInteger(hours) || hours < 0 || hours > 999) {
    throw new Error("Часы длительности должны быть целым числом от 0 до 999.");
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    throw new Error("Минуты длительности должны быть целым числом от 0 до 59.");
  }
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes < 1) throw new Error("Укажите длительность курса больше 0 минут.");
  return totalMinutes;
}

export function normalizeCourseCoverUrl(value: string | null) {
  return normalizeCourseImageUrl(value);
}

export function normalizeCourseThumbnailUrl(value: string | null) {
  return normalizeCourseImageUrl(value);
}

export function parseOptionalCourseCoverUpdate(formData: FormData, key = "courseCoverUrl") {
  if (!formData.has(key)) return undefined;
  return normalizeCourseCoverUrl(asOptionalString(formData, key));
}

export function parseOptionalCourseThumbnailUpdate(formData: FormData, key = "courseThumbnailUrl") {
  if (!formData.has(key)) return undefined;
  return normalizeCourseThumbnailUrl(asOptionalString(formData, key));
}

export function parseCourseMetadata(formData: FormData) {
  const categoryRaw = asString(formData, "category");
  const difficultyLevelRaw = asString(formData, "difficultyLevel");
  const coverUrlRaw = asOptionalString(formData, "coverUrl");
  const thumbnailUrlRaw = asOptionalString(formData, "thumbnailUrl");
  if (categoryRaw && !isCourseCategory(categoryRaw)) {
    throw new Error("Выберите категорию курса из справочника.");
  }
  if (difficultyLevelRaw && !isCourseDifficultyLevel(difficultyLevelRaw)) {
    throw new Error("Выберите корректный уровень сложности.");
  }
  return {
    category: categoryRaw || null,
    difficultyLevel: difficultyLevelRaw || null,
    durationMinutes: parseCourseDurationMinutes(formData),
    thumbnailUrl: normalizeCourseThumbnailUrl(thumbnailUrlRaw),
    coverUrl: normalizeCourseCoverUrl(coverUrlRaw),
  };
}

export function parseCourseNavigationMode(formData: FormData) {
  const value = asString(formData, "navigationMode") || "FREE";
  if (!COURSE_NAVIGATION_MODES.includes(value as (typeof COURSE_NAVIGATION_MODES)[number])) {
    throw new Error("Выберите корректный режим прохождения.");
  }
  return value;
}

export function parseCourseTags(formData: FormData) {
  const tags = asString(formData, "tags")
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
  const uniqueTags = [...new Set(tags)];
  return uniqueTags.length ? JSON.stringify(uniqueTags) : null;
}

function normalizeCourseImageUrl(value: string | null) {
  if (!value) return null;
  if (/^\/uploads\/course-covers\/[a-z0-9-]+\.(png|jpe?g|gif)$/i.test(value)) return value;
  throw new Error("Допустимы только загруженные изображения JPEG, PNG или GIF.");
}
