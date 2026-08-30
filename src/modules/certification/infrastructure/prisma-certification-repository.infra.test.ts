import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaCertificationRepository as repo } from "./prisma-certification-repository";

// Инфра-тест репозитория сертификатов против настоящей БД. Запуск: npm run test:infra.

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

test("findCertificate: нет → null, есть → находит", async () => {
  await seedUser("u-cf");
  await seedCourse("c-cf");

  const none = await repo.transact({
    courseId: "c-cf",
    userId: "u-cf",
    execute: (tx) => tx.findCertificate(),
  });
  assert.equal(none, null);

  await prisma.certificate.create({
    data: { serial: "s-cf", courseId: "c-cf", userId: "u-cf", issuedVia: "MANUAL", completedAt: new Date(), snapshotJson: "{}" },
  });

  const found = await repo.transact({
    courseId: "c-cf",
    userId: "u-cf",
    execute: (tx) => tx.findCertificate(),
  });
  assert.equal(found?.serial, "s-cf");
});

test("createCertificate создаёт запись со статусом ISSUED", async () => {
  await seedUser("u-cc");
  await seedCourse("c-cc");

  const created = await repo.transact({
    courseId: "c-cc",
    userId: "u-cc",
    execute: (tx) =>
      tx.createCertificate({
        serial: "s-cc",
        courseId: "c-cc",
        userId: "u-cc",
        issuedVia: "LEARNING",
        issuedById: null,
        completedAt: new Date(),
        snapshotJson: '{"x":1}',
      }),
  });
  assert.equal(created.serial, "s-cc");

  const row = await prisma.certificate.findFirst({ where: { serial: "s-cc" } });
  assert.equal(row?.status, "ISSUED");
  assert.equal(row?.issuedVia, "LEARNING");
});

test("recordEffects пишет OutboxEvent и аудит в одной транзакции", async () => {
  await seedUser("u-re");

  await repo.transact({
    courseId: "c-re",
    userId: "u-re",
    execute: (tx) =>
      tx.recordEffects({
        outboxEvents: [{ topic: "certification.certificate-issued-email.v1", payload: { a: 1 } }],
        audit: {
          actorId: "u-re",
          actorLogin: null,
          actorName: null,
          action: "CERTIFICATE_ISSUED",
          objectType: "Certificate",
          objectId: "obj-re",
          objectLabel: "s-re",
          metadata: { k: "v" },
        },
      }),
  });

  const events = await prisma.outboxEvent.findMany({
    where: { topic: "certification.certificate-issued-email.v1" },
  });
  assert.equal(events.length, 1);
  assert.match(events[0].payloadJson, /"a":1/);

  const audits = await prisma.auditLogEvent.findMany({ where: { action: "CERTIFICATE_ISSUED" } });
  assert.equal(audits.length, 1);
});

test("isUniqueViolation ловит P2002 по @@unique([courseId, userId])", async () => {
  await seedUser("u-uv");
  await seedCourse("c-uv");
  await prisma.certificate.create({
    data: { serial: "s-uv-1", courseId: "c-uv", userId: "u-uv", issuedVia: "MANUAL", completedAt: new Date(), snapshotJson: "{}" },
  });

  let caught: unknown;
  try {
    await prisma.certificate.create({
      data: { serial: "s-uv-2", courseId: "c-uv", userId: "u-uv", issuedVia: "MANUAL", completedAt: new Date(), snapshotJson: "{}" },
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "дубликат должен упасть");
  assert.equal(repo.isUniqueViolation(caught), true);
  assert.equal(repo.isUniqueViolation(new Error("прочее")), false);
});

test("loadCompletionContext: назначенный ученик, живые элементы, бренд", async () => {
  await seedUser("u-lc");
  await seedCourse("c-lc");
  await prisma.courseItem.create({
    data: { id: "i-lc", courseId: "c-lc", type: "TEXT", title: "Материал", orderIndex: 0, isRequired: true },
  });
  await prisma.courseUserAssignment.create({
    data: { courseId: "c-lc", userId: "u-lc", assignedById: "u-lc" },
  });

  const ctx = await repo.transact({
    courseId: "c-lc",
    userId: "u-lc",
    execute: (tx) => tx.loadCompletionContext(),
  });
  assert.ok(ctx);
  assert.equal(ctx.isAssignedLearner, true);
  assert.equal(ctx.course.id, "c-lc");
  assert.equal(ctx.items.length, 1);
  assert.equal(ctx.learner.login, "login-u-lc");
  assert.ok(ctx.platform.siteName, "бренд платформы (дефолт) подтянут");
});
