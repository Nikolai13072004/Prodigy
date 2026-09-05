import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyUploadKey } from "./classify-upload-key";

test("обложки, аватары и медиа тестов классифицируются по префиксу", () => {
  assert.deepEqual(classifyUploadKey("course-covers/abc.png"), { kind: "course-cover" });
  assert.deepEqual(classifyUploadKey("user-avatars/abc.webp"), { kind: "avatar" });
  assert.deepEqual(classifyUploadKey("quiz-attachments/abc.pdf"), { kind: "quiz-attachment" });
  assert.deepEqual(classifyUploadKey("quiz-question-media/abc.png"), { kind: "quiz-media" });
});

test("pptx-html5: baseName берётся из второго сегмента независимо от глубины", () => {
  assert.deepEqual(classifyUploadKey("pptx-html5/BASE/index.html"), {
    kind: "pptx-html5",
    baseName: "BASE",
  });
  assert.deepEqual(classifyUploadKey("pptx-html5/BASE/base-slides/slide-001.jpg"), {
    kind: "pptx-html5",
    baseName: "BASE",
  });
  assert.deepEqual(classifyUploadKey("pptx-html5/BASE/imsmanifest.xml"), {
    kind: "pptx-html5",
    baseName: "BASE",
  });
});

test("pptx-html5 без baseName даёт пустой baseName (роут откажет)", () => {
  assert.deepEqual(classifyUploadKey("pptx-html5"), { kind: "pptx-html5", baseName: "" });
});

test("корневой файл: baseName и extension разбираются, extension в нижнем регистре", () => {
  assert.deepEqual(classifyUploadKey("abc123.pdf"), {
    kind: "root-file",
    baseName: "abc123",
    extension: ".pdf",
  });
  assert.deepEqual(classifyUploadKey("abc123.PPTX"), {
    kind: "root-file",
    baseName: "abc123",
    extension: ".pptx",
  });
  assert.deepEqual(classifyUploadKey("abc123.mp4"), {
    kind: "root-file",
    baseName: "abc123",
    extension: ".mp4",
  });
});

test("корневой файл без расширения: extension пустой", () => {
  assert.deepEqual(classifyUploadKey("noext"), {
    kind: "root-file",
    baseName: "noext",
    extension: "",
  });
});

test("двойное расширение: базой считается всё до последней точки", () => {
  assert.deepEqual(classifyUploadKey("archive.tar.gz"), {
    kind: "root-file",
    baseName: "archive.tar",
    extension: ".gz",
  });
});
