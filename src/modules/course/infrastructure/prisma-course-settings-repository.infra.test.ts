import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaCourseSettingsRepository as repo } from "./prisma-course-settings-repository";

// Инфра-тест репозитория настроек курса против настоящей (временной) БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x" },
  });
}

function seedCourse(id: string, extra: Record<string, unknown> = {}) {
  return prisma.course.create({ data: { id, title: `Course ${id}`, ...extra } });
}

function seedItem(id: string, courseId: string, extra: Record<string, unknown> = {}) {
  return prisma.courseItem.create({
    data: { id, courseId, type: "TEXT", title: `Item ${id}`, orderIndex: 0, isRequired: false, ...extra },
  });
}

test("updateProgression: пишет режимы, сбрасывает isRequired и включает только требуемые", async () => {
  await seedCourse("c-cst-1");
  await seedItem("i-cst-1", "c-cst-1", { type: "TEXT", orderIndex: 0, isRequired: true });
  await seedItem("i-cst-2", "c-cst-1", { type: "QUIZ", orderIndex: 1 });
  await seedItem("i-cst-3", "c-cst-1", { type: "TEXT", orderIndex: 2 });

  await repo.transact((tx) =>
    tx.updateProgression("c-cst-1", {
      navigationMode: "SEQUENTIAL",
      quizGateMode: "PASSED",
      completionMode: "REQUIRED_ITEMS",
      statusFormat: "PASSED_WITH_SCORE",
      requiredItemIds: ["i-cst-2", "i-cst-3"],
      gradedItemIds: ["i-cst-2"],
    }),
  );

  const course = await prisma.course.findUnique({ where: { id: "c-cst-1" } });
  assert.equal(course?.navigationMode, "SEQUENTIAL");
  assert.equal(course?.quizGateMode, "PASSED");
  assert.equal(course?.completionMode, "REQUIRED_ITEMS");
  assert.equal(course?.statusFormat, "PASSED_WITH_SCORE");
  assert.equal(course?.gradedItemIdsJson, JSON.stringify(["i-cst-2"]));

  const items = await prisma.courseItem.findMany({
    where: { courseId: "c-cst-1" },
    orderBy: { orderIndex: "asc" },
    select: { id: true, isRequired: true },
  });
  // i-cst-1 был обязательным — сброшен; i-cst-2 и i-cst-3 включены планом.
  assert.deepEqual(items, [
    { id: "i-cst-1", isRequired: false },
    { id: "i-cst-2", isRequired: true },
    { id: "i-cst-3", isRequired: true },
  ]);
});

test("updateProgression: пустой gradedItemIds → gradedItemIdsJson = null", async () => {
  await seedCourse("c-cst-2");
  await seedItem("i-cst-2a", "c-cst-2", { orderIndex: 0 });

  await repo.transact((tx) =>
    tx.updateProgression("c-cst-2", {
      navigationMode: "FREE",
      quizGateMode: "RESOLVED",
      completionMode: "ALL_ITEMS",
      statusFormat: "COMPLETED_ONLY",
      requiredItemIds: ["i-cst-2a"],
      gradedItemIds: [],
    }),
  );

  const course = await prisma.course.findUnique({ where: { id: "c-cst-2" } });
  assert.equal(course?.gradedItemIdsJson, null);
});

test("loadProgression: снимок настроек и только живые элементы по порядку", async () => {
  await seedCourse("c-cst-3", {
    navigationMode: "SEQUENTIAL",
    quizGateMode: "PASSED",
    completionMode: "REQUIRED_ITEMS",
    statusFormat: "PASSED_WITH_SCORE",
    gradedItemIdsJson: JSON.stringify(["i-cst-3b"]),
  });
  await seedItem("i-cst-3b", "c-cst-3", { type: "QUIZ", orderIndex: 1 });
  await seedItem("i-cst-3a", "c-cst-3", { type: "TEXT", orderIndex: 0 });
  await seedItem("i-cst-3z", "c-cst-3", { type: "TEXT", orderIndex: 2, archivedAt: new Date() });

  const snapshot = await repo.transact((tx) => tx.loadProgression("c-cst-3"));
  assert.ok(snapshot);
  assert.equal(snapshot.id, "c-cst-3");
  assert.equal(snapshot.title, "Course c-cst-3");
  assert.equal(snapshot.navigationMode, "SEQUENTIAL");
  assert.equal(snapshot.quizGateMode, "PASSED");
  assert.equal(snapshot.completionMode, "REQUIRED_ITEMS");
  assert.equal(snapshot.statusFormat, "PASSED_WITH_SCORE");
  assert.equal(snapshot.gradedItemIdsJson, JSON.stringify(["i-cst-3b"]));
  // Архивный i-cst-3z исключён; порядок — по orderIndex.
  assert.deepEqual(
    snapshot.items,
    [
      { id: "i-cst-3a", type: "TEXT" },
      { id: "i-cst-3b", type: "QUIZ" },
    ],
  );
});

test("updateDetails → loadDetails: круговой рейс полей курса", async () => {
  await seedCourse("c-cst-4");

  const details = {
    title: "Обновлённый курс",
    description: "Описание",
    requirements: "Требования",
    targetAudience: "Аудитория",
    category: "cat",
    difficultyLevel: "BEGINNER",
    durationMinutes: 90,
    tagsJson: JSON.stringify(["a", "b"]),
    thumbnailUrl: "/uploads/thumb.png",
    coverUrl: "/uploads/cover.png",
    navigationMode: "SEQUENTIAL",
    resultViewMode: "SCORE_ONLY",
  };

  await repo.transact((tx) => tx.updateDetails("c-cst-4", details));

  const loaded = await repo.transact((tx) => tx.loadDetails("c-cst-4"));
  assert.ok(loaded);
  assert.equal(loaded.id, "c-cst-4");
  assert.equal(loaded.title, "Обновлённый курс");
  assert.equal(loaded.durationMinutes, 90);
  assert.equal(loaded.navigationMode, "SEQUENTIAL");
  assert.equal(loaded.coverUrl, "/uploads/cover.png");
});

test("recordAudit: пишет строку аудита с актором и метаданными", async () => {
  await seedUser("u-cst-1");
  await seedCourse("c-cst-5");

  await repo.transact((tx) =>
    tx.recordAudit({
      actor: {
        id: "u-cst-1",
        login: "login-u-cst-1",
        name: "User u-cst-1",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      },
      action: "COURSE_PROGRESSION_UPDATED",
      courseId: "c-cst-5",
      courseTitle: "Course c-cst-5",
      metadata: { navigationMode: "SEQUENTIAL" },
    }),
  );

  const audit = await prisma.auditLogEvent.findFirst({
    where: { action: "COURSE_PROGRESSION_UPDATED", objectId: "c-cst-5" },
  });
  assert.ok(audit);
  assert.equal(audit.actorId, "u-cst-1");
  assert.equal(audit.objectType, "course");
  assert.equal(audit.objectLabel, "Course c-cst-5");
  assert.match(audit.metadataJson ?? "", /"navigationMode":"SEQUENTIAL"/);
});
