import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaLearningRepository as repo } from "./prisma-learning-repository";

// Инфра-тест репозитория обучения против настоящей БД. Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x" },
  });
}

function seedCourse(id: string) {
  return prisma.course.create({ data: { id, title: `Course ${id}` } });
}

test("findMaterial: возвращает материал; архивный → null", async () => {
  await seedCourse("c-lm");
  await prisma.courseItem.create({
    data: { id: "i-lm", courseId: "c-lm", type: "TEXT", title: "Материал", orderIndex: 0, isRequired: true },
  });

  const found = await repo.findMaterial("i-lm");
  assert.equal(found?.id, "i-lm");
  assert.equal(found?.type, "TEXT");
  assert.equal(found?.isRequired, true);

  await prisma.courseItem.create({
    data: { id: "i-lm-arch", courseId: "c-lm", type: "TEXT", title: "Архив", orderIndex: 1, archivedAt: new Date() },
  });
  assert.equal(await repo.findMaterial("i-lm-arch"), null, "архивный не находится");
});

test("saveEventAndProject: пишет событие и проекцию, отдаёт предыдущий прогресс", async () => {
  await seedUser("u-lm");
  await seedCourse("c-lm2");
  await prisma.courseItem.create({
    data: { id: "i-lm2", courseId: "c-lm2", type: "TEXT", title: "Материал", orderIndex: 0, isRequired: true },
  });

  const material = { id: "i-lm2", courseId: "c-lm2", type: "TEXT", totalSlides: null, isRequired: true };
  const projection = { progressPercent: 100, maxPageSeen: 1, totalPages: 1, viewedPages: [1] };

  const first = await repo.saveEventAndProject({
    material,
    userId: "u-lm",
    event: { type: "MATERIAL_COMPLETED" },
    project: () => projection,
  });
  assert.equal(first.previousProgressPercent, null, "первый раз — прежнего прогресса нет");
  assert.equal(first.projection.progressPercent, 100);

  const view = await prisma.courseItemView.findUnique({
    where: { courseItemId_userId: { courseItemId: "i-lm2", userId: "u-lm" } },
  });
  assert.equal(view?.progressPercent, 100);
  assert.equal(await prisma.learningEvent.count({ where: { courseItemId: "i-lm2", userId: "u-lm" } }), 1);

  const second = await repo.saveEventAndProject({
    material,
    userId: "u-lm",
    event: { type: "MATERIAL_COMPLETED" },
    project: () => projection,
  });
  assert.equal(second.previousProgressPercent, 100, "второй раз — прежний прогресс 100");
});
