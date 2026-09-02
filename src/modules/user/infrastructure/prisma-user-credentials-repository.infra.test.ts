import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";
import { prismaUserCredentialsRepository as repo } from "./prisma-user-credentials-repository";

// Инфра-тест репозитория credentials (reset password / send invite).
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(
  id: string,
  overrides: { email?: string | null; status?: string; role?: string } = {},
) {
  return prisma.user.create({
    data: {
      id,
      login: `login-${id}`,
      name: `User ${id}`,
      firstName: "Имя",
      lastName: null,
      passwordHash: "old-hash",
      role: overrides.role ?? "Ученик",
      status: overrides.status ?? USER_STATUSES.ACTIVE,
      email: overrides.email ?? null,
    },
  });
}

test("findUserForPasswordReset: возвращает нужные поля, missing → null", async () => {
  await seedUser("uc-pr-1", { email: "pr@corp.ru" });

  const user = await repo.findUserForPasswordReset("uc-pr-1");
  assert.equal(user?.email, "pr@corp.ru");
  assert.equal(user?.login, "login-uc-pr-1");

  const missing = await repo.findUserForPasswordReset("missing-x");
  assert.equal(missing, null);
});

test("findUserForInvite: собирает roleNames из user.role + userRoles.roleProfile.name", async () => {
  await seedUser("uc-inv-1", { role: "Ученик" });
  const roleHr = await prisma.roleProfile.create({
    data: { name: "uc-role-HR", permissionsJson: "[]", isSystem: false },
  });
  await prisma.userRole.create({
    data: { userId: "uc-inv-1", roleProfileId: roleHr.id },
  });

  const user = await repo.findUserForInvite("uc-inv-1");
  assert.ok(user);
  assert.deepEqual(
    [...user.roleNames].sort(),
    ["Ученик", "uc-role-HR"].sort(),
  );
  assert.equal(user.status, USER_STATUSES.ACTIVE);
});

test("findUserForInvite: missing → null", async () => {
  const user = await repo.findUserForInvite("missing-y");
  assert.equal(user, null);
});

test("resetPasswordAndCancelResetTokens: обновляет хеш, сбрасывает блокировку и отменяет PENDING PasswordResetToken", async () => {
  await seedUser("uc-rp-1", {
    email: "rp@corp.ru",
  });
  await prisma.user.update({
    where: { id: "uc-rp-1" },
    data: {
      failedLoginAttempts: 4,
      loginLockedUntil: new Date("2099-01-01T00:00:00Z"),
    },
  });
  await prisma.passwordResetToken.createMany({
    data: [
      {
        userId: "uc-rp-1",
        email: "rp@corp.ru",
        tokenHash: "uc-rp-hash-pending",
        status: "PENDING",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      },
      {
        userId: "uc-rp-1",
        email: "rp@corp.ru",
        tokenHash: "uc-rp-hash-used",
        status: "USED",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      },
    ],
  });

  await repo.transact(async (tx) =>
    tx.resetPasswordAndCancelResetTokens("uc-rp-1", "new-hash"),
  );

  const user = await prisma.user.findUnique({
    where: { id: "uc-rp-1" },
    select: {
      passwordHash: true,
      failedLoginAttempts: true,
      loginLockedUntil: true,
    },
  });
  assert.equal(user?.passwordHash, "new-hash");
  assert.equal(user?.failedLoginAttempts, 0);
  assert.equal(user?.loginLockedUntil, null);

  const tokens = await prisma.passwordResetToken.findMany({
    where: { userId: "uc-rp-1" },
    orderBy: { tokenHash: "asc" },
  });
  const statuses = Object.fromEntries(
    tokens.map((token) => [token.tokenHash, token.status]),
  );
  assert.equal(statuses["uc-rp-hash-pending"], "CANCELLED");
  assert.equal(statuses["uc-rp-hash-used"], "USED", "не PENDING — не трогаем");
});

test("recordEffects: пишет audit тем же tx-клиентом", async () => {
  await seedUser("uc-au-1");
  await repo.transact(async (tx) =>
    tx.recordEffects({
      audit: {
        actorId: null,
        actorLogin: null,
        actorName: null,
        action: "uc-audit-only",
        objectType: "user",
        objectId: "uc-au-1",
        objectLabel: "User uc-au-1",
        ipAddress: null,
        userAgent: null,
        metadata: { hello: "world" },
      },
    }),
  );
  const audits = await prisma.auditLogEvent.findMany({
    where: { action: "uc-audit-only" },
  });
  assert.equal(audits.length, 1);
  assert.match(audits[0].metadataJson ?? "", /"hello":"world"/);
});

test("transact атомарна: throw откатывает reset", async () => {
  await seedUser("uc-tx-1");
  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.resetPasswordAndCancelResetTokens("uc-tx-1", "would-be-new");
      throw new Error("boom");
    }),
    /boom/,
  );
  const user = await prisma.user.findUnique({
    where: { id: "uc-tx-1" },
    select: { passwordHash: true },
  });
  assert.equal(user?.passwordHash, "old-hash");
});
