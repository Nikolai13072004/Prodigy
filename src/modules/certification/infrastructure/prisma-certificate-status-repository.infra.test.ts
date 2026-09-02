import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaCertificateStatusRepository as repo } from "./prisma-certificate-status-repository";

// Инфра-тест репозитория статуса сертификата. Запуск: npm run test:infra.
// Seed-id/serial с префиксом cs- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function seedCertificate(opts: { serial: string; userId: string; courseId: string; status?: string }) {
  await prisma.user.create({
    data: { id: opts.userId, login: `login-${opts.userId}`, name: `U ${opts.userId}`, passwordHash: "x" },
  });
  await prisma.course.create({ data: { id: opts.courseId, title: `Course ${opts.courseId}` } });
  return prisma.certificate.create({
    data: {
      serial: opts.serial,
      courseId: opts.courseId,
      userId: opts.userId,
      issuedVia: "MANUAL",
      completedAt: new Date(),
      snapshotJson: "{}",
      status: opts.status ?? "ISSUED",
    },
  });
}

test("revoke → REVOKED + аудит в той же транзакции", async () => {
  const cert = await seedCertificate({ serial: "cs-s1", userId: "cs-u1", courseId: "cs-c1" });

  await repo.transact(async (tx) => {
    await tx.revoke({ certificateId: cert.id, revokedById: "cs-u1", reason: "ошибка" });
    await tx.recordAudit({
      actorId: "cs-u1", actorLogin: "login-cs-u1", actorName: "U cs-u1",
      action: "certificates:revoke", objectType: "certificate", objectId: cert.id,
      objectLabel: cert.serial, ipAddress: "1.2.3.4", userAgent: "ua", metadata: { reason: "ошибка" },
    });
  });

  const row = await prisma.certificate.findUnique({ where: { id: cert.id } });
  assert.equal(row?.status, "REVOKED");
  assert.equal(row?.revokedById, "cs-u1");
  assert.equal(row?.revokeReason, "ошибка");
  assert.ok(row?.revokedAt);

  const audit = await prisma.auditLogEvent.findFirst({
    where: { objectId: cert.id, action: "certificates:revoke" },
  });
  assert.equal(audit?.ipAddress, "1.2.3.4");
});

test("restore → ISSUED, поля отзыва очищены", async () => {
  const cert = await seedCertificate({ serial: "cs-s2", userId: "cs-u2", courseId: "cs-c2", status: "REVOKED" });

  await repo.transact((tx) => tx.restore(cert.id));

  const row = await prisma.certificate.findUnique({ where: { id: cert.id } });
  assert.equal(row?.status, "ISSUED");
  assert.equal(row?.revokedAt, null);
  assert.equal(row?.revokedById, null);
  assert.equal(row?.revokeReason, null);
});

test("find: возвращает id/serial/status; null для чужого", async () => {
  const cert = await seedCertificate({ serial: "cs-s3", userId: "cs-u3", courseId: "cs-c3" });
  const found = await repo.transact((tx) => tx.find(cert.id));
  assert.equal(found?.serial, "cs-s3");
  assert.equal(found?.status, "ISSUED");
  const none = await repo.transact((tx) => tx.find("cs-missing"));
  assert.equal(none, null);
});
