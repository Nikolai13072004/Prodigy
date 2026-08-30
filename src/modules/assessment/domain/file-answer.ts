// Строгая валидация файлового ответа на вопрос теста (чистая, без БД/ФС).
// Раньше жила инлайн в course-assessment-actions. Бросает локализованную ошибку —
// как и прочие доменные assert-правила assessment (транспорт ловит и показывает текст).

export type FileAnswerConfig = {
  allowedExtensions?: string[] | null;
  maxFileSizeMb?: number | null;
};

function normalizeAllowedFileExtensions(extensions: string[] | null | undefined) {
  return [
    ...new Set(
      (extensions ?? [])
        .map((value) => value.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function extractFileExtension(value: string) {
  const normalized = value.split("?")[0] ?? value;
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1).toLowerCase() : "";
}

// Возвращает нормализованный JSON {url, fileName, size} либо "" для пустого ответа.
// Бросает Error с человекочитаемым текстом при нарушении правил.
export function normalizeFileAnswer(rawValue: string, config: FileAnswerConfig) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  let parsed: { url?: unknown; fileName?: unknown; size?: unknown };
  try {
    parsed = JSON.parse(trimmed) as { url?: unknown; fileName?: unknown; size?: unknown };
  } catch {
    throw new Error("Некорректный ответ с файлом");
  }

  const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
  const fileName = typeof parsed.fileName === "string" ? parsed.fileName.trim() : "";
  const size = typeof parsed.size === "number" ? parsed.size : Number(parsed.size ?? NaN);

  if (!url.startsWith("/uploads/quiz-attachments/")) {
    throw new Error("Файл должен быть загружен через форму теста");
  }
  if (!fileName) {
    throw new Error("Не указано имя загруженного файла");
  }
  if (!Number.isFinite(size) || size < 1) {
    throw new Error("Не удалось определить размер загруженного файла");
  }

  const allowedExtensions = normalizeAllowedFileExtensions(config.allowedExtensions);
  const ext = extractFileExtension(fileName) || extractFileExtension(url);
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
    throw new Error("Тип загруженного файла не соответствует настройкам вопроса");
  }

  const maxFileSizeMb =
    Number.isFinite(config.maxFileSizeMb) && Number(config.maxFileSizeMb) >= 1
      ? Math.min(Number(config.maxFileSizeMb), 200)
      : 10;
  if (size > maxFileSizeMb * 1024 * 1024) {
    throw new Error("Размер загруженного файла превышает ограничение вопроса");
  }

  return JSON.stringify({ url, fileName, size });
}
