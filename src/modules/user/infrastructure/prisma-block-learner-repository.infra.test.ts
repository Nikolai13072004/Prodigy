import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaBlockLearnerRepository as repo } from "./prisma-block-learner-repository";

// Инфра-тест репозитория блокировки ученика. Запуск: npm run test:infra.
// Seed-id с префиксом bl- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

test("findLearner: возвращает статус/роль/имена ролей; null для чужого", async () => {
  await prisma.user.create({
    data: { id: "bl-u1", login: "bl-login-1", name: "Ученик 1", email: "bl-1@e.com", role: "Ученик", status: "ACTIVE", passwordHash: "x" },
  });
  const learner = await repo.findLearner("bl-u1");
  assert.equal(learner?.status, "ACTIVE");
  assert.equal(learner?.role, "Ученик");
  assert.deepEqual(learner?.roleProfileNames, []);
  assert.equal(await repo.findLearner("bl-missing"), null);
});

test("findRelatedCourseIds: прямые назначения", async () => {
  await prisma.user.create({ data: { id: "bl-u2", login: "bl-login-2", name: "U2", role: "Ученик", passwordHash: "x" } });
  await prisma.course.create({ data: { id: "bl-c1", title: "C1" } });
  await prisma.course.create({ data: { id: "bl-c2", title: "C2" } });
  await prisma.courseUserAssignment.create({ data: { courseId: "bl-c1", userId: "bl-u2" } });
  await prisma.courseUserAssignment.create({ data: { courseId: "bl-c2", userId: "bl-u2" } });

  const ids = await repo.findRelatedCourseIds("bl-u2");
  assert.deepEqual([...ids].sort(), ["bl-c1", "bl-c2"]);
});

test("transact: блок пользователя + отмена PENDING-активаций + аудит атомарно", async () => {
  await prisma.user.create({
    data: { id: "bl-u3", login: "bl-login-3", name: "U3", email: "bl-3@e.com", role: "Ученик", status: "ACTIVE", passwordHash: "x" },
  });
  await prisma.userActivationInvite.create({
    data: { userId: "bl-u3", email: "bl-3@e.com", tokenHash: "bl-hash-3", status: "PENDING", expiresAt: new Date(Date.now() + 1e6) },
  });

  await repo.transact(async (tx) => {
    await tx.blockUser("bl-u3");
    await tx.cancelPendingActivationInvites("bl-u3");
    await tx.recordAudit({
      actorId: null, actorLogin: "hr", actorName: "HR",
      action: "users:block", objectType: "user", objectId: "bl-u3", objectLabel: "U3",
      ipAddress: "9.9.9.9", userAgent: "ua", metadata: { source: "test" },
    });
  });

  const user = await prisma.user.findUnique({ where: { id: "bl-u3" } });
  assert.equal(user?.status, "BLOCKED");
  const invite = await prisma.userActivationInvite.findUnique({ where: { userId: "bl-u3" } });
  assert.equal(invite?.status, "CANCELLED");
  const audit = await prisma.auditLogEvent.findFirst({ where: { objectId: "bl-u3", action: "users:block" } });
  assert.equal(audit?.ipAddress, "9.9.9.9");
});
