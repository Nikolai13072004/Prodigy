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

test("dedup recovers when StorageFile metadata points to a missing disk file", async () => {
  const originalCwd = process.cwd();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lms-storage-dedup-"));
  process.chdir(tempRoot);
  process.env.DATABASE_URL = prismaFileUrl(path.join(tempRoot, "storage-test.db"));

  const prisma = (await import("@/lib/prisma")).default;

  try {
    await createStorageFileTable(prisma);
    const { putBufferDedup } = await import("./dedup");

    const first = await putBufferDedup("uploads", "first.txt", "same content", {
      extension: ".txt",
      mimeType: "text/plain",
      purpose: "test",
    });
    await rm(first.object.absolutePath, { force: true });

    assert.equal(await prisma.storageFile.count(), 1);

    const second = await putBufferDedup("uploads", "second.txt", "same content", {
      extension: ".txt",
      mimeType: "text/plain",
      purpose: "test",
    });

    assert.equal(second.deduplicated, false);
    assert.equal(second.object.key, "second.txt");
    assert.equal(await prisma.storageFile.count(), 1);

    const record = await prisma.storageFile.findFirstOrThrow();
    assert.equal(record.key, "second.txt");
  } finally {
    await prisma.$disconnect();
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
