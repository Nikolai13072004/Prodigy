import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaCourseLifecycleRepository as repo } from "./prisma-course-lifecycle-repository";

// Инфра-тест репозитория жизненного цикла курса против настоящей (временной) БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x" },
  });
}

function seedCourse(id: string, data: { status?: string } = {}) {
  return prisma.course.create({
    data: { id, title: `Course ${id}`, description: `Описание ${id}`, ...data },
  });
}

test("load: снимок курса с разделом и материалом; loadIdentity находит и возвращает null", async () => {
  await seedCourse("c-clf-load");
  await prisma.courseModule.create({
    data: { id: "m-clf-load", courseId: "c-clf-load", title: "Раздел", orderIndex: 0 },
  });
  await prisma.courseItem.create({
    data: {
      id: "i-clf-load",
      courseId: "c-clf-load",
      moduleId: "m-clf-load",
      type: "TEXT",
      title: "Материал",
      orderIndex: 0,
      content: "текст материала",
    },
  });

  const snapshot = await repo.transact((tx) => tx.load("c-clf-load"));
  assert.ok(snapshot);
  assert.equal(snapshot.id, "c-clf-load");
  assert.equal(snapshot.title, "Course c-clf-load");
  assert.equal(snapshot.status, "DRAFT");
  assert.equal(snapshot.moduleCount, 1);
  assert.equal(snapshot.affectedAudienceCount, 0);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].type, "TEXT");
  assert.equal(snapshot.items[0].moduleId, "m-clf-load");
  assert.equal(typeof snapshot.publishedSnapshotJson, "string");

  const identity = await repo.transact((tx) => tx.loadIdentity("c-clf-load"));
  assert.deepEqual(identity, { id: "c-clf-load", title: "Course c-clf-load", status: "DRAFT" });

  const missing = await repo.transact((tx) => tx.loadIdentity("нет-такого-clf"));
  assert.equal(missing, null);
});

test("changeStatus: DRAFT → PUBLISHED с publishedAt, снимком и снятым флагом изменений", async () => {
  await seedCourse("c-clf-status", { status: "DRAFT" });

  const publishedAt = new Date();
  await repo.transact((tx) =>
    tx.changeStatus({
      courseId: "c-clf-status",
      status: "PUBLISHED",
      publishedAt,
      publishedSnapshotJson: '{"v":1}',
      hasUnpublishedChanges: false,
    }),
  );

  const row = await prisma.course.findUnique({ where: { id: "c-clf-status" } });
  assert.equal(row?.status, "PUBLISHED");
  assert.equal(row?.publishedAt?.getTime(), publishedAt.getTime());
  assert.equal(row?.publishedSnapshotJson, '{"v":1}');
  assert.equal(row?.hasUnpublishedChanges, false);
});

test("delete: удаляет курс и каскадно его материалы", async () => {
  await seedCourse("c-clf-del");
  await prisma.courseItem.create({
    data: { id: "i-clf-del", courseId: "c-clf-del", type: "TEXT", title: "Материал", orderIndex: 0 },
  });

  await repo.transact((tx) => tx.delete("c-clf-del"));

  assert.equal(await prisma.course.findUnique({ where: { id: "c-clf-del" } }), null);
  assert.equal(await prisma.courseItem.count({ where: { courseId: "c-clf-del" } }), 0);
});

test("recordAudit: пишет запись в AuditLogEvent", async () => {
  await seedUser("u-clf-audit");
  await seedCourse("c-clf-audit");

  await repo.transact((tx) =>
    tx.recordAudit({
      actor: {
        id: "u-clf-audit",
        login: "login-u-clf-audit",
        name: "User u-clf-audit",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      },
      action: "COURSE_PUBLISHED",
      courseId: "c-clf-audit",
      courseTitle: "Course c-clf-audit",
      metadata: { from: "DRAFT", to: "PUBLISHED" },
    }),
  );

  const event = await prisma.auditLogEvent.findFirst({
    where: { objectType: "course", objectId: "c-clf-audit" },
  });
  assert.ok(event);
  assert.equal(event.action, "COURSE_PUBLISHED");
  assert.equal(event.actorId, "u-clf-audit");
  assert.equal(event.objectLabel, "Course c-clf-audit");
  assert.match(event.metadataJson ?? "", /"to":"PUBLISHED"/);
});
