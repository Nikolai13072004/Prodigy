// Чистая классификация ключа файла `/uploads/<key>` по префиксу — без БД и
// без server-only, чтобы покрываться юнит-тестами. Определяет, какое правило
// доступа применять и как искать владельца (см. upload-access.ts).

export type UploadClass =
  | { kind: "course-cover" }
  | { kind: "avatar" }
  | { kind: "quiz-attachment" }
  | { kind: "quiz-media" }
  | { kind: "pptx-html5"; baseName: string }
  | { kind: "root-file"; baseName: string; extension: string };

export function classifyUploadKey(key: string): UploadClass {
  const segments = key.split("/").filter(Boolean);
  const head = segments[0] ?? "";

  if (head === "course-covers") return { kind: "course-cover" };
  if (head === "user-avatars") return { kind: "avatar" };
  if (head === "quiz-attachments") return { kind: "quiz-attachment" };
  if (head === "quiz-question-media") return { kind: "quiz-media" };
  if (head === "pptx-html5") return { kind: "pptx-html5", baseName: segments[1] ?? "" };

  const name = segments[segments.length - 1] ?? "";
  const dot = name.lastIndexOf(".");
  const baseName = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : "";
  return { kind: "root-file", baseName, extension };
}
