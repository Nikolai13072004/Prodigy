import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFileAnswer } from "./file-answer";

const validFile = (over: Partial<{ url: string; fileName: string; size: number }> = {}) =>
  JSON.stringify({
    url: "/uploads/quiz-attachments/abc.pdf",
    fileName: "abc.pdf",
    size: 1024,
    ...over,
  });

test("пустой ответ → пустая строка", () => {
  assert.equal(normalizeFileAnswer("", {}), "");
  assert.equal(normalizeFileAnswer("   ", {}), "");
});

test("валидный файл → нормализованный JSON {url, fileName, size}", () => {
  const result = normalizeFileAnswer(validFile(), {});
  assert.deepEqual(JSON.parse(result), {
    url: "/uploads/quiz-attachments/abc.pdf",
    fileName: "abc.pdf",
    size: 1024,
  });
});

test("невалидный JSON → бросает", () => {
  assert.throws(() => normalizeFileAnswer("{не json", {}), /Некорректный ответ с файлом/);
});

test("URL вне /uploads/quiz-attachments/ → бросает", () => {
  assert.throws(
    () => normalizeFileAnswer(validFile({ url: "/uploads/other/x.pdf" }), {}),
    /Файл должен быть загружен через форму теста/,
  );
});

test("пустое имя файла → бросает", () => {
  assert.throws(() => normalizeFileAnswer(validFile({ fileName: "" }), {}), /Не указано имя/);
});

test("размер < 1 или нечисло → бросает", () => {
  assert.throws(() => normalizeFileAnswer(validFile({ size: 0 }), {}), /размер загруженного файла/);
});

test("расширение вне allowlist → бросает; в allowlist → проходит", () => {
  assert.throws(
    () => normalizeFileAnswer(validFile({ fileName: "a.exe", url: "/uploads/quiz-attachments/a.exe" }), {
      allowedExtensions: ["pdf", "docx"],
    }),
    /Тип загруженного файла/,
  );
  const ok = normalizeFileAnswer(validFile(), { allowedExtensions: [".PDF"] });
  assert.equal(JSON.parse(ok).fileName, "abc.pdf", "нормализация allowlist (.PDF → pdf) допускает файл");
});

test("размер сверх лимита вопроса → бросает; дефолт 10 МБ", () => {
  assert.throws(
    () => normalizeFileAnswer(validFile({ size: 11 * 1024 * 1024 }), {}),
    /превышает ограничение/,
  );
  // Явный лимит 20 МБ допускает 11 МБ.
  const ok = normalizeFileAnswer(validFile({ size: 11 * 1024 * 1024 }), { maxFileSizeMb: 20 });
  assert.equal(JSON.parse(ok).size, 11 * 1024 * 1024);
});

test("лимит вопроса ограничен потолком 200 МБ", () => {
  assert.throws(
    () => normalizeFileAnswer(validFile({ size: 201 * 1024 * 1024 }), { maxFileSizeMb: 500 }),
    /превышает ограничение/,
  );
});
