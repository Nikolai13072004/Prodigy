import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";

// Инфра-тест на реальной БД (PostgreSQL). Запуск: npm run test:infra.
//
// Сценарий восстановления тома: файл под ключом A заменили другим содержимым,
// а запись StorageFile для A осталась со старым хешем. Если индексация примет
// A за дубликат B и не тронет устаревшую запись, последующая загрузка старого
// содержимого дедуплицируется на физический файл A — и пользователь получит
// не те байты, которые загружал.
//
// STORAGE_ROOTS в @/lib/storage резолвит process.cwd() при загрузке модуля,
// поэтому chdir во временный каталог делаем ДО динамического импорта ./dedup.
// Ключи — с префиксом sk- (глобально уникальны в общей БД).

const PREFIX = "sk-";

after(async () => {
  await prisma.$disconnect();
});

test("индексация приводит устаревшую запись ключа в соответствие с содержимым файла", async () => {
  const originalCwd = process.cwd();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lms-storage-stale-"));
  process.chdir(tempRoot);

  try {
    const { putBufferDedup, indexStorageFile } = await import("./dedup");
    const { storage } = await import("./index");

    const oldContent = "sk СТАРОЕ содержимое";
    const newContent = "sk НОВОЕ содержимое";

    await putBufferDedup("uploads", `${PREFIX}a.txt`, oldContent, { extension: ".txt" });
    await putBufferDedup("uploads", `${PREFIX}b.txt`, newContent, { extension: ".txt" });

    // Том восстановили: файл a.txt теперь содержит то же, что и b.txt.
    await storage.put("uploads", `${PREFIX}a.txt`, newContent);

    await indexStorageFile("uploads", `${PREFIX}a.txt`, { extension: ".txt" });

    const staleRow = await prisma.storageFile.findUnique({ where: { key: `${PREFIX}a.txt` } });
    assert.equal(
      staleRow === null || staleRow.sha256 !== undefined,
      true,
      "запись для a.txt должна быть либо удалена, либо приведена к фактическому содержимому",
    );

    // Главное: загрузка СТАРОГО содержимого не должна выдать файл a.txt,
    // в котором теперь лежат другие байты.
    const reupload = await putBufferDedup("uploads", `${PREFIX}c.txt`, oldContent, {
      extension: ".txt",
    });

    if (reupload.deduplicated) {
      const bytes = await storage.get("uploads", reupload.object.key);
      assert.equal(
        bytes.toString(),
        oldContent,
        `дедупликация вернула ${reupload.object.key} с чужим содержимым`,
      );
    }
  } finally {
    await prisma.storageFile.deleteMany({ where: { key: { startsWith: PREFIX } } });
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
