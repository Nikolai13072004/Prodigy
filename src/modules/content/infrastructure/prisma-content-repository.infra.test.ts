import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaContentRepository as repo } from "./prisma-content-repository";

// Инфра-тест репозитория контента против настоящей (временной) БД. Запуск: npm run test:infra.
// Все id с префиксом `cnt` — база общая с другими инфра-тестами.

after(async () => {
  await prisma.$disconnect();
});

function seedCourse(id: string) {
  return prisma.course.create({ data: { id, title: `Course ${id}` } });
}

test("createModule пишет модуль, nextModuleOrderIndex растёт в той же транзакции", async () => {
  await seedCourse("c-cnt-mod");

  const result = await repo.transact(async (tx) => {
    const idx0 = await tx.nextModuleOrderIndex("c-cnt-mod");
    const m1 = await tx.createModule({
      courseId: "c-cnt-mod",
      title: "Модуль 1",
      description: null,
      orderIndex: idx0,
    });
    const idx1 = await tx.nextModuleOrderIndex("c-cnt-mod");
    const m2 = await tx.createModule({
      courseId: "c-cnt-mod",
      title: "Модуль 2",
      description: "описание",
      orderIndex: idx1,
    });
    return { idx0, idx1, m1, m2 };
  });

  assert.equal(result.idx0, 0);
  assert.equal(result.idx1, 1);

  const modules = await prisma.courseModule.findMany({
    where: { courseId: "c-cnt-mod" },
    orderBy: { orderIndex: "asc" },
  });
  assert.equal(modules.length, 2);
  assert.deepEqual([modules[0].id, modules[1].id], [result.m1.id, result.m2.id]);
  assert.equal(modules[0].orderIndex, 0);
  assert.equal(modules[1].orderIndex, 1);
  assert.equal(modules[1].description, "описание");
});

test("createItem TEXT сохраняет content и оставляет fileUrl пустым", async () => {
  await seedCourse("c-cnt-item");

  const created = await repo.transact((tx) =>
    tx.createItem({
      courseId: "c-cnt-item",
      moduleId: null,
      orderIndex: 0,
      type: "TEXT",
      title: "Материал",
      content: "Тело материала",
      fileUrl: null,
      totalSlides: null,
      presentationViewMode: "PDF_PREVIEW",
      isRequired: true,
      quiz: null,
      survey: null,
    }),
  );

  const row = await prisma.courseItem.findUnique({ where: { id: created.id } });
  assert.ok(row);
  assert.equal(row.courseId, "c-cnt-item");
  assert.equal(row.type, "TEXT");
  assert.equal(row.content, "Тело материала");
  assert.equal(row.fileUrl, null);
  assert.equal(row.isRequired, true);
  assert.equal(row.orderIndex, 0);
});

test("loadOrdering + updateItemOrder переупорядочивают элементы курса", async () => {
  await seedCourse("c-cnt-ord");
  await prisma.courseItem.create({
    data: { id: "i-cnt-a", courseId: "c-cnt-ord", type: "TEXT", title: "A", orderIndex: 0 },
  });
  await prisma.courseItem.create({
    data: { id: "i-cnt-b", courseId: "c-cnt-ord", type: "TEXT", title: "B", orderIndex: 1 },
  });

  const before = await repo.transact((tx) => tx.loadOrdering("c-cnt-ord"));
  assert.deepEqual(
    before.items.map((item) => item.id),
    ["i-cnt-a", "i-cnt-b"],
  );

  await repo.transact((tx) =>
    tx.updateItemOrder([
      { id: "i-cnt-a", orderIndex: 1 },
      { id: "i-cnt-b", orderIndex: 0 },
    ]),
  );

  const reordered = await repo.transact((tx) => tx.loadOrdering("c-cnt-ord"));
  assert.deepEqual(
    reordered.items.map((item) => item.id),
    ["i-cnt-b", "i-cnt-a"],
  );
});

test("archiveItem проставляет archivedAt один раз, повторно → false", async () => {
  await seedCourse("c-cnt-arch");
  await prisma.courseItem.create({
    data: { id: "i-cnt-arch", courseId: "c-cnt-arch", type: "TEXT", title: "Удаляемый", orderIndex: 0 },
  });

  const first = await repo.transact((tx) =>
    tx.archiveItem("c-cnt-arch", "i-cnt-arch", new Date()),
  );
  assert.equal(first, true);

  const row = await prisma.courseItem.findUnique({ where: { id: "i-cnt-arch" } });
  assert.ok(row?.archivedAt, "archivedAt должен быть проставлен");

  const second = await repo.transact((tx) =>
    tx.archiveItem("c-cnt-arch", "i-cnt-arch", new Date()),
  );
  assert.equal(second, false, "уже заархивирован — обновлять нечего");
});
