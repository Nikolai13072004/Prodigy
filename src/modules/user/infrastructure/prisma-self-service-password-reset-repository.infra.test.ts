import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/password-resets";
import { prismaSelfServicePasswordResetRepository as repo } from "./prisma-self-service-password-reset-repository";

// Инфра-тест репозитория самостоятельного сброса пароля. Запуск: npm run test:infra.
// Все seed-id с префиксом ssr- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(opts: { id: string; login: string; email?: string | null; status?: string }) {
  return prisma.user.create({
    data: {
      id: opts.id,
      login: opts.login,
      name: `U ${opts.id}`,
      email: opts.email ?? null,
      status: opts.status ?? "ACTIVE",
      passwordHash: "old-hash",
    },
  });
}

async function seedToken(opts: { userId: string; email: string; status?: string; expiresAt?: Date }) {
  const { token, tokenHash } = createPasswordResetToken();
  const created = await prisma.passwordResetToken.create({
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

test("findUserByIdentifiers: находит по логину и по email", async () => {
  await seedUser({ id: "ssr-u1", login: "ssr-login-1", email: "ssr-1@example.com" });
  assert.equal((await repo.findUserByIdentifiers(["ssr-login-1"]))?.id, "ssr-u1");
  assert.equal((await repo.findUserByIdentifiers(["ssr-1@example.com"]))?.id, "ssr-u1");
  assert.equal(await repo.findUserByIdentifiers(["nope"]), null);
});

test("issueResetToken: создаёт новый и отменяет прежний PENDING", async () => {
  const user = await seedUser({ id: "ssr-u2", login: "ssr-login-2", email: "ssr-2@example.com" });
  const old = await seedToken({ userId: user.id, email: "ssr-2@example.com" });

  const fresh = createPasswordResetToken();
  await repo.issueResetToken({
    userId: user.id,
    email: "ssr-2@example.com",
    tokenHash: fresh.tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const oldRow = await prisma.passwordResetToken.findUnique({ where: { id: old.id } });
  assert.equal(oldRow?.status, "CANCELLED");
  const newRow = await repo.findResetByToken(fresh.token);
  assert.equal(newRow?.status, "PENDING");
});

test("findResetByToken: по сырому токену с пользователем", async () => {
  const user = await seedUser({ id: "ssr-u3", login: "ssr-login-3", email: "ssr-3@example.com" });
  const { token } = await seedToken({ userId: user.id, email: "ssr-3@example.com" });
  const found = await repo.findResetByToken(token);
  assert.equal(found?.userId, user.id);
  assert.equal(found?.user.login, "ssr-login-3");
  assert.equal(await repo.findResetByToken("no-such"), null);
});

test("applyPasswordReset: PENDING→ACTIVE, токен USED, прочие PENDING отменены", async () => {
  const user = await seedUser({ id: "ssr-u4", login: "ssr-login-4", email: "ssr-4@example.com", status: "PENDING" });
  const target = await seedToken({ userId: user.id, email: "ssr-4@example.com" });
  const other = await seedToken({ userId: user.id, email: "ssr-4@example.com" });

  await repo.applyPasswordReset({
    userId: user.id,
    passwordHash: "new-hash",
    currentStatus: "PENDING",
    tokenId: target.id,
  });

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(updated?.passwordHash, "new-hash");
  assert.equal(updated?.status, "ACTIVE");
  assert.equal(updated?.loginLockedUntil, null);

  const targetRow = await prisma.passwordResetToken.findUnique({ where: { id: target.id } });
  assert.equal(targetRow?.status, "USED");
  assert.ok(targetRow?.usedAt);
  const otherRow = await prisma.passwordResetToken.findUnique({ where: { id: other.id } });
  assert.equal(otherRow?.status, "CANCELLED");
});

test("applyPasswordReset: ACTIVE остаётся ACTIVE", async () => {
  const user = await seedUser({ id: "ssr-u5", login: "ssr-login-5", email: "ssr-5@example.com", status: "ACTIVE" });
  const target = await seedToken({ userId: user.id, email: "ssr-5@example.com" });

  await repo.applyPasswordReset({
    userId: user.id,
    passwordHash: "new-hash",
    currentStatus: "ACTIVE",
    tokenId: target.id,
  });

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(updated?.status, "ACTIVE");
});

test("markResetExpired: переводит токен в EXPIRED", async () => {
  const user = await seedUser({ id: "ssr-u6", login: "ssr-login-6", email: "ssr-6@example.com" });
  const { id } = await seedToken({
    userId: user.id,
    email: "ssr-6@example.com",
    expiresAt: new Date(Date.now() - 60_000),
  });
  await repo.markResetExpired(id);
  const row = await prisma.passwordResetToken.findUnique({ where: { id } });
  assert.equal(row?.status, "EXPIRED");
});
