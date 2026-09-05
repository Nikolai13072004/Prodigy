import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaEnrollmentMutationRepository as repo } from "./prisma-enrollment-mutation-repository";

// Инфра-тест репозитория назначений против настоящей БД. Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

function seedUser(id: string, extra: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x", ...extra },
  });
}

function seedCourse(id: string, status = "PUBLISHED") {
  return prisma.course.create({ data: { id, title: `Course ${id}`, status } });
}

test("loadState: прямые, групповые и наследованные назначения; нет курса → null", async () => {
  await seedUser("u-cs-d");
  await seedUser("u-cs-g");
  await seedCourse("c-cs");
  await prisma.group.create({ data: { id: "g-cs", name: "Группа CS" } });
  await prisma.groupMembership.create({ data: { groupId: "g-cs", userId: "u-cs-g" } });
  await prisma.courseUserAssignment.create({ data: { courseId: "c-cs", userId: "u-cs-d", assignedById: "u-cs-d" } });
  await prisma.courseGroupAssignment.create({ data: { courseId: "c-cs", groupId: "g-cs", assignedById: "u-cs-d" } });

  const state = await repo.transact((tx) => tx.loadState("c-cs"));
  assert.ok(state);
  assert.equal(state.course.status, "PUBLISHED");
  assert.deepEqual(state.directUserIds, ["u-cs-d"]);
  assert.deepEqual(state.groupIds, ["g-cs"]);
  assert.deepEqual(state.inheritedUserIds, ["u-cs-g"]);

  const missing = await repo.transact((tx) => tx.loadState("нет-курса"));
  assert.equal(missing, null);
});

test("replaceState: старые прямые назначения заменяются новыми", async () => {
  await seedUser("u-cs2-old");
  await seedUser("u-cs2-new");
  await seedUser("u-cs2-actor");
  await seedCourse("c-cs2");
  await prisma.courseUserAssignment.create({ data: { courseId: "c-cs2", userId: "u-cs2-old", assignedById: "u-cs2-actor" } });

  await repo.transact((tx) =>
    tx.replaceState({
      courseId: "c-cs2",
      actorId: "u-cs2-actor",
      directUserIds: ["u-cs2-new"],
      groupIds: [],
      accessExpiresAt: null,
      pendingInviteDelete: "ALL",
      pendingInvites: [],
    })
  );

  const userIds = (
    await prisma.courseUserAssignment.findMany({ where: { courseId: "c-cs2" }, select: { userId: true } })
  ).map((row) => row.userId);
  assert.deepEqual(userIds, ["u-cs2-new"], "старое удалено, новое создано");
});

test("findActiveRecipients: только активные с email", async () => {
  await seedUser("u-cs3-a", { email: "a@corp.ru", status: "ACTIVE" });
  await seedUser("u-cs3-b", { email: "b@corp.ru", status: "BLOCKED" });
  await seedUser("u-cs3-c", { email: null, status: "ACTIVE" });

  const recipients = await repo.transact((tx) =>
    tx.findActiveRecipients(["u-cs3-a", "u-cs3-b", "u-cs3-c"], [])
  );
  assert.deepEqual(
    recipients.map((r) => r.userId),
    ["u-cs3-a"],
    "заблокированный и без email отсеяны"
  );
});

test("recordEffects пишет аудит и OutboxEvent", async () => {
  await seedUser("u-cs4");

  await repo.transact((tx) =>
    tx.recordEffects({
      audit: {
        actorId: "u-cs4",
        actorLogin: "u-cs4@corp.ru",
        actorName: "Actor",
        action: "courses:assign",
        objectType: "course",
        objectId: "c-cs4",
        objectLabel: "Курс",
        ipAddress: null,
        userAgent: null,
        metadata: { k: "v" },
      },
      outboxEvents: [{ topic: "enrollment.course-assigned-email.v1", payload: { recipients: [] } }],
    })
  );

  assert.equal(await prisma.auditLogEvent.count({ where: { action: "courses:assign" } }), 1);
  assert.equal(
    await prisma.outboxEvent.count({ where: { topic: "enrollment.course-assigned-email.v1" } }),
    1
  );
});
