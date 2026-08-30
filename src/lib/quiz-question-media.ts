export type QuizQuestionMediaKind = "image" | "video";

export type QuizQuestionMedia = {
  kind: QuizQuestionMediaKind;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export const QUIZ_QUESTION_MEDIA_BASE_URL = "/uploads/quiz-question-media/";

export const QUIZ_QUESTION_MEDIA_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

export const QUIZ_QUESTION_MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
]);

export const QUIZ_QUESTION_MEDIA_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

export function getQuizQuestionMediaKind(mimeType: string): QuizQuestionMediaKind | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

export function normalizeQuizQuestionMedia(value: unknown): QuizQuestionMedia | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<QuizQuestionMedia>;
  const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
  const fileName = typeof candidate.fileName === "string" ? candidate.fileName.trim() : "";
  const mimeType = typeof candidate.mimeType === "string" ? candidate.mimeType.trim().toLowerCase() : "";
  const size = typeof candidate.size === "number" ? candidate.size : Number(candidate.size ?? NaN);
  const kind =
    candidate.kind === "image" || candidate.kind === "video"
      ? candidate.kind
      : getQuizQuestionMediaKind(mimeType);

  if (!url.startsWith(QUIZ_QUESTION_MEDIA_BASE_URL)) return null;
  if (!fileName || !mimeType || !QUIZ_QUESTION_MEDIA_MIME_TYPES.has(mimeType)) return null;
  if (!kind || !Number.isFinite(size) || size < 1) return null;

  return {
    kind,
    url,
    fileName,
    mimeType,
    size,
  };
}

export function parseQuizQuestionMediaFromConfig(raw: string | null | undefined) {
  if (!raw?.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return normalizeQuizQuestionMedia((parsed as { media?: unknown }).media);
  } catch {
    return null;
  }
}

export function parseQuizQuestionMediaJson(raw: string | null | undefined) {
  if (!raw?.trim()) return null;

  try {
    return normalizeQuizQuestionMedia(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
