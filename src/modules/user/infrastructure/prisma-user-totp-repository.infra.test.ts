import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaUserTotpRepository as repo } from "./prisma-user-totp-repository";

// Инфра-тест репозитория TOTP-креденшла. Запуск: npm run test:infra.
// Seed-id с префиксом totp- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `U ${id}`, passwordHash: "x" },
  });
}

test("upsertTotpCredential: создаёт и перезаписывает секрет/коды", async () => {
  const user = await seedUser("totp-u1");
  await repo.upsertTotpCredential({
    userId: user.id,
    secretCiphertext: "enc-1",
    recoveryCodesJson: JSON.stringify(["h1", "h2"]),
  });
  let cred = await prisma.userTotpCredential.findUnique({ where: { userId: user.id } });
  assert.equal(cred?.secretCiphertext, "enc-1");
  assert.deepEqual(JSON.parse(cred!.recoveryCodesJson), ["h1", "h2"]);

  await repo.upsertTotpCredential({
    userId: user.id,
    secretCiphertext: "enc-2",
    recoveryCodesJson: JSON.stringify(["h3"]),
  });
  cred = await prisma.userTotpCredential.findUnique({ where: { userId: user.id } });
  assert.equal(cred?.secretCiphertext, "enc-2");
  assert.deepEqual(JSON.parse(cred!.recoveryCodesJson), ["h3"]);
});
