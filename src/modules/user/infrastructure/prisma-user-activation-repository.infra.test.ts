import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { createUserActivationToken } from "@/lib/user-activations";
import { prismaUserActivationRepository as repo } from "./prisma-user-activation-repository";

// Инфра-тест репозитория активации аккаунта. Запуск: npm run test:infra.
// Все seed-id с префиксом uai- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(opts: { id: string; login: string; email: string; status?: string }) {
  return prisma.user.create({
    data: {
      id: opts.id,
      login: opts.login,
      name: `U ${opts.id}`,
      email: opts.email,
      status: opts.status ?? "PENDING",
      passwordHash: "old-hash",
    },
  });
}

async function seedInvite(opts: { userId: string; email: string; status?: string; expiresAt?: Date }) {
  const { token, tokenHash } = createUserActivationToken();
  const created = await prisma.userActivationInvite.create({
    data: {
      userId: opts.userId,
      email: opts.email,
      tokenHash,
      status: opts.status ?? "PENDING",
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60_000),
    },
  });
  return { token, id: created.id };
}

test("findActivationByToken: по сырому токену с пользователем; null для чужого", async () => {
  const user = await seedUser({ id: "uai-u1", login: "uai-login-1", email: "uai-1@example.com" });
  const { token } = await seedInvite({ userId: user.id, email: "uai-1@example.com" });
  const found = await repo.findActivationByToken(token);
  assert.equal(found?.userId, user.id);
  assert.equal(found?.user.login, "uai-login-1");
  assert.equal(found?.status, "PENDING");
  assert.equal(await repo.findActivationByToken("no-such"), null);
});

test("activateAccount: PENDING→ACTIVE, пароль обновлён, приглашение ACCEPTED", async () => {
  const user = await seedUser({ id: "uai-u2", login: "uai-login-2", email: "uai-2@example.com", status: "PENDING" });
  const invite = await seedInvite({ userId: user.id, email: "uai-2@example.com" });

  await repo.activateAccount({ userId: user.id, passwordHash: "new-hash", inviteId: invite.id });

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(updated?.passwordHash, "new-hash");
  assert.equal(updated?.status, "ACTIVE");
  assert.equal(updated?.loginLockedUntil, null);

  const inviteRow = await prisma.userActivationInvite.findUnique({ where: { id: invite.id } });
  assert.equal(inviteRow?.status, "ACCEPTED");
  assert.ok(inviteRow?.activatedAt);
});

test("markActivationExpired: переводит приглашение в EXPIRED", async () => {
  const user = await seedUser({ id: "uai-u3", login: "uai-login-3", email: "uai-3@example.com" });
  const invite = await seedInvite({
    userId: user.id,
    email: "uai-3@example.com",
    expiresAt: new Date(Date.now() - 60_000),
  });
  await repo.markActivationExpired(invite.id);
  const row = await prisma.userActivationInvite.findUnique({ where: { id: invite.id } });
  assert.equal(row?.status, "EXPIRED");
});
