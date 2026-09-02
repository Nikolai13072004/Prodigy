import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";
import { prismaUserLifecycleRepository as repo } from "./prisma-user-lifecycle-repository";

// Инфра-тест репозитория жизненного цикла пользователя против настоящей БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(
  id: string,
  overrides: {
    status?: string;
    failedLoginAttempts?: number;
    loginLockedUntil?: Date | null;
    email?: string | null;
  } = {},
) {
  return prisma.user.create({
    data: {
      id,
      login: `login-${id}`,
      name: `User ${id}`,
      passwordHash: "x",
      status: overrides.status ?? USER_STATUSES.ACTIVE,
      failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
      loginLockedUntil: overrides.loginLockedUntil ?? null,
      email: overrides.email ?? null,
    },
  });
}

test("findUsersByIds: пустой вход → пустой массив, без обращения к БД", async () => {
  const rows = await repo.transact(async (tx) => tx.findUsersByIds([]));
  assert.deepEqual(rows, []);
});

test("findUsersByIds: возвращает только запрошенные записи", async () => {
  await seedUser("u-find-1");
  await seedUser("u-find-2");
  await seedUser("u-find-3");

  const rows = await repo.transact(async (tx) =>
    tx.findUsersByIds(["u-find-1", "u-find-3", "missing"]),
  );
  const ids = rows.map((row) => row.id).sort();
  assert.deepEqual(ids, ["u-find-1", "u-find-3"]);
});

test("changeUserStatuses: меняет статус и сбрасывает failedLoginAttempts / loginLockedUntil", async () => {
  await seedUser("u-cs-1", {
    failedLoginAttempts: 5,
    loginLockedUntil: new Date("2099-01-01T00:00:00Z"),
  });
  await seedUser("u-cs-2", { failedLoginAttempts: 3 });

  await repo.transact(async (tx) =>
    tx.changeUserStatuses(["u-cs-1", "u-cs-2"], USER_STATUSES.ARCHIVED),
  );

  const rows = await prisma.user.findMany({
    where: { id: { in: ["u-cs-1", "u-cs-2"] } },
    select: {
      status: true,
      failedLoginAttempts: true,
      loginLockedUntil: true,
    },
  });
  for (const row of rows) {
    assert.equal(row.status, USER_STATUSES.ARCHIVED);
    assert.equal(row.failedLoginAttempts, 0);
    assert.equal(row.loginLockedUntil, null);
  }
});

test("changeUserStatuses: пустой список — no-op", async () => {
  await seedUser("u-noop", { failedLoginAttempts: 7 });
  await repo.transact(async (tx) =>
    tx.changeUserStatuses([], USER_STATUSES.ARCHIVED),
  );
  const row = await prisma.user.findUnique({
    where: { id: "u-noop" },
    select: { status: true, failedLoginAttempts: true },
  });
  assert.equal(row?.status, USER_STATUSES.ACTIVE);
  assert.equal(row?.failedLoginAttempts, 7);
});

test("cancelPendingInvites: только PENDING → CANCELLED, остальные статусы не тронуты", async () => {
  await seedUser("u-inv-1", { email: "inv1@corp.ru" });
  await seedUser("u-inv-2", { email: "inv2@corp.ru" });

  await prisma.userActivationInvite.create({
    data: {
      userId: "u-inv-1",
      email: "inv1@corp.ru",
      tokenHash: "hash-pending",
      status: "PENDING",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    },
  });
  await prisma.userActivationInvite.create({
    data: {
      userId: "u-inv-2",
      email: "inv2@corp.ru",
      tokenHash: "hash-activated",
      status: "ACTIVATED",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    },
  });

  await repo.transact(async (tx) =>
    tx.cancelPendingInvites(["u-inv-1", "u-inv-2"]),
  );

  const invites = await prisma.userActivationInvite.findMany({
    where: { userId: { in: ["u-inv-1", "u-inv-2"] } },
    orderBy: { userId: "asc" },
  });
  const map = new Map(invites.map((invite) => [invite.userId, invite.status]));
  assert.equal(map.get("u-inv-1"), "CANCELLED");
  assert.equal(map.get("u-inv-2"), "ACTIVATED", "не PENDING — не трогаем");
});

test("recordEffects: пишет audit тем же tx-клиентом (ADR-005)", async () => {
  await seedUser("u-audit", { email: "audit@corp.ru" });

  await repo.transact(async (tx) =>
    tx.recordEffects({
      audit: {
        actorId: "u-audit",
        actorLogin: "admin@corp.ru",
        actorName: "Админ",
        action: "users:archive",
        objectType: "user",
        objectId: "u-audit",
        objectLabel: "User u-audit",
        ipAddress: "10.0.0.1",
        userAgent: "test-agent",
        metadata: { k: "v", n: 1 },
      },
    }),
  );

  const events = await prisma.auditLogEvent.findMany({
    where: { action: "users:archive", objectId: "u-audit" },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "u-audit");
  assert.equal(events[0].ipAddress, "10.0.0.1");
  assert.equal(events[0].userAgent, "test-agent");
  assert.match(events[0].metadataJson ?? "", /"k":"v"/);
});

test("recordEffects: без audit — ничего не пишет", async () => {
  const before = await prisma.auditLogEvent.count();
  await repo.transact(async (tx) => tx.recordEffects({}));
  const after = await prisma.auditLogEvent.count();
  assert.equal(before, after);
});

test("hardDeleteUser + каскадные подчистки: физически удаляет пользователя и уносит связанные CourseInvite/EmailJob", async () => {
  await seedUser("u-hd", { email: "hd@corp.ru" });
  await prisma.emailJob.create({
    data: {
      toEmail: "hd@corp.ru",
      subject: "s",
      htmlBody: "b",
      textBody: "b",
      status: "PENDING",
    },
  });
  await prisma.emailJob.create({
    data: {
      toEmail: "hd@corp.ru",
      subject: "s2",
      htmlBody: "b",
      textBody: "b",
      status: "PROCESSED",
    },
  });
  await prisma.courseInvite.create({
    data: {
      email: "hd@corp.ru",
      tokenHash: "hd-hash-1",
      // courseId необязателен для проверки удаления — но валидатор схемы
      // может требовать курс: создаём минимальный.
      course: { create: { title: "Course-HD" } },
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    },
  });

  await repo.transact(async (tx) => {
    await tx.deleteUserEmailJobsByEmail("hd@corp.ru");
    await tx.deleteCourseInvitesByEmail("hd@corp.ru");
    await tx.deleteCourseInvitesByAcceptedUserId("u-hd");
    await tx.hardDeleteUser("u-hd");
  });

  const user = await prisma.user.findUnique({ where: { id: "u-hd" } });
  assert.equal(user, null, "user удалён");
  const jobs = await prisma.emailJob.findMany({
    where: { toEmail: "hd@corp.ru" },
    select: { status: true },
  });
  assert.deepEqual(jobs.map((j) => j.status).sort(), ["PROCESSED"]);
  const invites = await prisma.courseInvite.count({
    where: { email: "hd@corp.ru" },
  });
  assert.equal(invites, 0);
});

test("transact атомарна: если внутри execute бросили — статус не меняется, audit не пишется", async () => {
  await seedUser("u-tx", { failedLoginAttempts: 2 });
  const beforeAuditCount = await prisma.auditLogEvent.count({
    where: { objectId: "u-tx" },
  });

  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.changeUserStatuses(["u-tx"], USER_STATUSES.ARCHIVED);
      await tx.recordEffects({
        audit: {
          actorId: null,
          actorLogin: null,
          actorName: null,
          action: "users:archive",
          objectType: "user",
          objectId: "u-tx",
          objectLabel: "User u-tx",
          ipAddress: null,
          userAgent: null,
          metadata: {},
        },
      });
      throw new Error("boom");
    }),
    /boom/,
  );

  const row = await prisma.user.findUnique({
    where: { id: "u-tx" },
    select: { status: true, failedLoginAttempts: true },
  });
  assert.equal(row?.status, USER_STATUSES.ACTIVE, "статус не изменился");
  assert.equal(row?.failedLoginAttempts, 2);
  const afterAuditCount = await prisma.auditLogEvent.count({
    where: { objectId: "u-tx" },
  });
  assert.equal(afterAuditCount, beforeAuditCount, "аудит не записался");
});
