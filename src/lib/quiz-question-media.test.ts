import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getQuizQuestionMediaKind,
  normalizeQuizQuestionMedia,
  parseQuizQuestionMediaFromConfig,
  parseQuizQuestionMediaJson,
  QUIZ_QUESTION_MEDIA_BASE_URL,
} from "./quiz-question-media";

// Медиа к вопросу теста: URL допускается только из своей папки загрузок,
// MIME — по белому списку, размер положительный. Защита от чужих ссылок.

const validImage = {
  kind: "image",
  url: `${QUIZ_QUESTION_MEDIA_BASE_URL}a.png`,
  fileName: "a.png",
  mimeType: "image/png",
  size: 1024,
};

// ------------------------------------------------------ getQuizQuestionMediaKind

test("getQuizQuestionMediaKind различает изображение, видео и прочее", () => {
  assert.equal(getQuizQuestionMediaKind("image/png"), "image");
  assert.equal(getQuizQuestionMediaKind("video/mp4"), "video");
  assert.equal(getQuizQuestionMediaKind("application/pdf"), null);
  assert.equal(getQuizQuestionMediaKind(""), null);
});

// ------------------------------------------------------ normalizeQuizQuestionMedia

test("нормализует валидное медиа и определяет kind по MIME", () => {
  const result = normalizeQuizQuestionMedia({
    url: `  ${QUIZ_QUESTION_MEDIA_BASE_URL}clip.mp4 `,
    fileName: "  clip.mp4 ",
    mimeType: "VIDEO/MP4",
    size: 2048,
  });
  assert.deepEqual(result, {
    kind: "video", // выведен из MIME
    url: `${QUIZ_QUESTION_MEDIA_BASE_URL}clip.mp4`, // обрезан
    fileName: "clip.mp4",
    mimeType: "video/mp4", // приведён к нижнему регистру
    size: 2048,
  });
});

test("размер-строка приводится к числу", () => {
  const result = normalizeQuizQuestionMedia({ ...validImage, size: "1024" });
  assert.equal(result?.size, 1024);
});

test("отвергает не-объект", () => {
  assert.equal(normalizeQuizQuestionMedia(null), null);
  assert.equal(normalizeQuizQuestionMedia("строка"), null);
  assert.equal(normalizeQuizQuestionMedia(42), null);
});

test("отвергает URL вне папки медиа (защита от чужих ссылок)", () => {
  for (const url of [
    "https://зло.test/a.png",
    "/uploads/quiz-attachments/a.png",
    "/etc/passwd",
    "quiz-question-media/a.png", // без ведущего слэша
    `..${QUIZ_QUESTION_MEDIA_BASE_URL}a.png`,
  ]) {
    assert.equal(normalizeQuizQuestionMedia({ ...validImage, url }), null, `пропущен url: ${url}`);
  }
});

test("отвергает MIME вне белого списка", () => {
  for (const mimeType of ["image/svg+xml", "application/pdf", "text/html", ""]) {
    assert.equal(normalizeQuizQuestionMedia({ ...validImage, mimeType }), null, `пропущен mime: ${mimeType}`);
  }
});

test("отвергает пустое имя файла", () => {
  assert.equal(normalizeQuizQuestionMedia({ ...validImage, fileName: "" }), null);
  assert.equal(normalizeQuizQuestionMedia({ ...validImage, fileName: "   " }), null);
});

test("отвергает неположительный или отсутствующий размер", () => {
  assert.equal(normalizeQuizQuestionMedia({ ...validImage, size: 0 }), null);
  assert.equal(normalizeQuizQuestionMedia({ ...validImage, size: -5 }), null);
  const { size: _omit, ...noSize } = validImage;
  void _omit;
  assert.equal(normalizeQuizQuestionMedia(noSize), null);
});

// ------------------------------------------------------ parse* обёртки

test("parseQuizQuestionMediaFromConfig достаёт media из config-объекта", () => {
  const raw = JSON.stringify({ media: validImage, other: "поле" });
  assert.deepEqual(parseQuizQuestionMediaFromConfig(raw)?.url, validImage.url);
  assert.equal(parseQuizQuestionMediaFromConfig(JSON.stringify({ media: null })), null);
  assert.equal(parseQuizQuestionMediaFromConfig("[1,2]"), null, "массив — не config");
  assert.equal(parseQuizQuestionMediaFromConfig("битый"), null);
  assert.equal(parseQuizQuestionMediaFromConfig(""), null);
  assert.equal(parseQuizQuestionMediaFromConfig(null), null);
});

test("parseQuizQuestionMediaJson разбирает медиа верхнего уровня", () => {
  assert.deepEqual(parseQuizQuestionMediaJson(JSON.stringify(validImage))?.fileName, "a.png");
  assert.equal(parseQuizQuestionMediaJson("битый"), null);
  assert.equal(parseQuizQuestionMediaJson(null), null);
});
