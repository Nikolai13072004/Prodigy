import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";

// Инфра-тест дедупликации на реальной БД (PostgreSQL). Запуск: npm run test:infra.
// Сценарий: запись StorageFile осталась, а физический файл с диска пропал —
// повторная загрузка того же содержимого должна восстановить файл, а не
// дедуплицироваться на отсутствующие байты.
//
// STORAGE_ROOTS в @/lib/storage резолвит process.cwd() при загрузке модуля,
// поэтому chdir во временный каталог делаем ДО динамического импорта ./dedup.
// Ключи — с префиксом dm- (глобально уникальны, изолируют счётчик в общей БД).

const PREFIX = "dm-";

after(async () => {
  await prisma.$disconnect();
});

test("dedup восстанавливается, когда запись StorageFile указывает на пропавший файл", async () => {
  const originalCwd = process.cwd();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lms-storage-dedup-"));
  process.chdir(tempRoot);

  try {
    const { putBufferDedup } = await import("./dedup");
    const content = "dm одинаковое содержимое";

    const first = await putBufferDedup("uploads", `${PREFIX}first.txt`, content, {
      extension: ".txt",
      mimeType: "text/plain",
      purpose: "test",
    });
    await rm(first.object.absolutePath, { force: true });

    assert.equal(
      await prisma.storageFile.count({ where: { key: { startsWith: PREFIX } } }),
      1,
    );

    const second = await putBufferDedup("uploads", `${PREFIX}second.txt`, content, {
      extension: ".txt",
      mimeType: "text/plain",
      purpose: "test",
    });

    assert.equal(second.deduplicated, false);
    assert.equal(second.object.key, `${PREFIX}second.txt`);
    assert.equal(
      await prisma.storageFile.count({ where: { key: { startsWith: PREFIX } } }),
      1,
    );

    const record = await prisma.storageFile.findFirstOrThrow({
      where: { key: { startsWith: PREFIX } },
    });
    assert.equal(record.key, `${PREFIX}second.txt`);
  } finally {
    await prisma.storageFile.deleteMany({ where: { key: { startsWith: PREFIX } } });
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
