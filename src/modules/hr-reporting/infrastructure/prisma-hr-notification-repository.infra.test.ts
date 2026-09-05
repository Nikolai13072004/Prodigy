import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaHrNotificationRepository as repo } from "./prisma-hr-notification-repository";

// Инфра-тест репозитория HR-уведомлений. Запуск: npm run test:infra.
// Seed-id с префиксом hn- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(id: string) {
  return prisma.user.create({ data: { id, login: `login-${id}`, name: `U ${id}`, passwordHash: "x" } });
}

test("upsertPreferences: создаёт и обновляет", async () => {
  const user = await seedUser("hn-u1");
  await repo.upsertPreferences(user.id, {
    notifyCourseCompleted: false,
    notifyLowActivity: true,
    lowActivityDays: 10,
    notifyAccessExpiring: false,
    accessExpiringDays: 3,
  });
  let pref = await prisma.hrNotificationPreference.findUnique({ where: { userId: user.id } });
  assert.equal(pref?.lowActivityDays, 10);
  assert.equal(pref?.notifyCourseCompleted, false);

  await repo.upsertPreferences(user.id, {
    notifyCourseCompleted: true,
    notifyLowActivity: true,
    lowActivityDays: 7,
    notifyAccessExpiring: true,
    accessExpiringDays: 7,
  });
  pref = await prisma.hrNotificationPreference.findUnique({ where: { userId: user.id } });
  assert.equal(pref?.lowActivityDays, 7);
  assert.equal(pref?.notifyCourseCompleted, true);
});

test("upsertDismissal → deleteDismissal", async () => {
  const user = await seedUser("hn-u2");
  await repo.upsertDismissal(user.id, {
    notificationKey: "hn-key-1",
    type: "LOW_ACTIVITY",
    courseId: "hn-c1",
    learnerId: "hn-l1",
  });
  let row = await prisma.hrNotificationDismissal.findUnique({
    where: { userId_notificationKey: { userId: user.id, notificationKey: "hn-key-1" } },
  });
  assert.equal(row?.type, "LOW_ACTIVITY");

  // повторный upsert обновляет тип
  await repo.upsertDismissal(user.id, {
    notificationKey: "hn-key-1",
    type: "ACCESS_EXPIRING",
    courseId: "hn-c1",
    learnerId: "hn-l1",
  });
  row = await prisma.hrNotificationDismissal.findUnique({
    where: { userId_notificationKey: { userId: user.id, notificationKey: "hn-key-1" } },
  });
  assert.equal(row?.type, "ACCESS_EXPIRING");

  await repo.deleteDismissal(user.id, "hn-key-1");
  row = await prisma.hrNotificationDismissal.findUnique({
    where: { userId_notificationKey: { userId: user.id, notificationKey: "hn-key-1" } },
  });
  assert.equal(row, null);
});
