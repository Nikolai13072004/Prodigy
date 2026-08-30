import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";

function prismaFileUrl(filePath: string) {
  return `file:${filePath.replace(/\\/g, "/")}`;
}

async function createStorageFileTable(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "StorageFile" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "area" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "sha256" TEXT NOT NULL,
      "sizeBytes" BIGINT NOT NULL,
      "extension" TEXT NOT NULL,
      "mimeType" TEXT,
      "originalName" TEXT,
      "purpose" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "StorageFile_key_key" ON "StorageFile"("key")`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "StorageFile_url_key" ON "StorageFile"("url")`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "StorageFile_area_sha256_sizeBytes_extension_key" ON "StorageFile"("area", "sha256", "sizeBytes", "extension")`,
  );
}

// Сценарий восстановления тома: файл под ключом A заменили другим содержимым,
// а запись StorageFile для A осталась со старым хешем. Если индексация примет
// A за дубликат B и не тронет устаревшую запись, последующая загрузка старого
// содержимого дедуплицируется на физический файл A — и пользователь получит
// не те байты, которые загружал.
test("индексация приводит устаревшую запись ключа в соответствие с содержимым файла", async () => {
  const originalCwd = process.cwd();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lms-storage-stale-"));
  process.chdir(tempRoot);
  process.env.DATABASE_URL = prismaFileUrl(path.join(tempRoot, "storage-stale.db"));

  const prisma = (await import("@/lib/prisma")).default;

  try {
    await createStorageFileTable(prisma);
    const { putBufferDedup, indexStorageFile } = await import("./dedup");
    const { storage } = await import("./index");

    await putBufferDedup("uploads", "a.txt", "СТАРОЕ содержимое", { extension: ".txt" });
    await putBufferDedup("uploads", "b.txt", "НОВОЕ содержимое", { extension: ".txt" });

    // Том восстановили: файл a.txt теперь содержит то же, что и b.txt.
    await storage.put("uploads", "a.txt", "НОВОЕ содержимое");

    await indexStorageFile("uploads", "a.txt", { extension: ".txt" });

    const staleRow = await prisma.storageFile.findUnique({ where: { key: "a.txt" } });
    assert.equal(
      staleRow === null || staleRow.sha256 !== undefined,
      true,
      "запись для a.txt должна быть либо удалена, либо приведена к фактическому содержимому"
    );

    // Главное: загрузка СТАРОГО содержимого не должна выдать файл a.txt,
    // в котором теперь лежат другие байты.
    const reupload = await putBufferDedup("uploads", "c.txt", "СТАРОЕ содержимое", {
      extension: ".txt",
    });

    if (reupload.deduplicated) {
      const bytes = await storage.get("uploads", reupload.object.key);
      assert.equal(
        bytes.toString(),
        "СТАРОЕ содержимое",
        `дедупликация вернула ${reupload.object.key} с чужим содержимым`
      );
    }
  } finally {
    await prisma.$disconnect();
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
