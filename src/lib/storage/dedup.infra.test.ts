import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { type StorageArea } from "@/lib/storage";
import { deleteStorageFileRecord, deleteStorageFileRecordsByIds } from "./dedup";

// Инфра-тест БД-функций жизненного цикла записей StorageFile. Запуск: npm run test:infra.
// StorageFile: key и url — глобально @unique; плюс @@unique([area, sha256, sizeBytes, extension]).
// Поэтому key/url/sha256 должны различаться в каждой строке — выводим их из уникального id.

after(async () => {
  await prisma.$disconnect();
});

function seedStorageFile(id: string, area: StorageArea, key: string) {
  return prisma.storageFile.create({
    data: {
      id,
      area,
      key,
      url: `/stg/${id}`,
      sha256: id.padEnd(64, "0"),
      sizeBytes: BigInt(1024),
      extension: ".pdf",
    },
  });
}

test("deleteStorageFileRecord удаляет только свою (area, key), не трогая другие", async () => {
  await seedStorageFile("sf-stg-d1-1", "uploads", "uploads/stg/d1-1.pdf");
  await seedStorageFile("sf-stg-d1-2", "uploads", "uploads/stg/d1-2.pdf");
  await seedStorageFile("sf-stg-d1-3", "branding", "branding/stg/d1-3.pdf");

  await deleteStorageFileRecord("uploads", "uploads/stg/d1-1.pdf");

  assert.equal(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d1-1" } }), null);
  // Та же area, но другой key — остаётся.
  assert.ok(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d1-2" } }));
  // Другая area — остаётся.
  assert.ok(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d1-3" } }));
});

test("deleteStorageFileRecord с чужой area не удаляет (area — часть фильтра)", async () => {
  await seedStorageFile("sf-stg-d5-1", "branding", "branding/stg/d5-1.pdf");

  // key существует, но в area "branding"; вызов по "uploads" не должен ничего удалить.
  await deleteStorageFileRecord("uploads", "branding/stg/d5-1.pdf");

  assert.ok(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d5-1" } }));
});

test("deleteStorageFileRecord несуществующей (area, key) не бросает и ничего не ломает", async () => {
  await seedStorageFile("sf-stg-d2-1", "uploads", "uploads/stg/d2-1.pdf");

  await assert.doesNotReject(deleteStorageFileRecord("uploads", "uploads/stg/does-not-exist.pdf"));

  assert.ok(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d2-1" } }));
});

test("deleteStorageFileRecordsByIds удаляет по списку id и возвращает count", async () => {
  await seedStorageFile("sf-stg-d3-1", "uploads", "uploads/stg/d3-1.pdf");
  await seedStorageFile("sf-stg-d3-2", "uploads", "uploads/stg/d3-2.pdf");
  await seedStorageFile("sf-stg-d3-3", "uploads", "uploads/stg/d3-3.pdf");

  const count = await deleteStorageFileRecordsByIds(["sf-stg-d3-1", "sf-stg-d3-2"]);
  assert.equal(count, 2);

  assert.equal(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d3-1" } }), null);
  assert.equal(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d3-2" } }), null);
  // Не вошедший в список — остаётся.
  assert.ok(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d3-3" } }));
});

test("deleteStorageFileRecordsByIds на пустом списке возвращает 0 и ничего не удаляет", async () => {
  await seedStorageFile("sf-stg-d4-1", "uploads", "uploads/stg/d4-1.pdf");

  const count = await deleteStorageFileRecordsByIds([]);
  assert.equal(count, 0);

  assert.ok(await prisma.storageFile.findUnique({ where: { id: "sf-stg-d4-1" } }));
});
