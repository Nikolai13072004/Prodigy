import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaUiPreferenceRepository as repo } from "./prisma-ui-preference-repository";

// Инфра-тест репозитория UI-предпочтений. Запуск: npm run test:infra.
// Seed-id с префиксом uip- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

async function seedUser(id: string) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `U ${id}`, passwordHash: "x" },
  });
}

test("upsertAdminCoursesView: создаёт и обновляет запись", async () => {
  const user = await seedUser("uip-u1");
  await repo.upsertAdminCoursesView(user.id, "cards");
  let pref = await prisma.userUiPreference.findUnique({ where: { userId: user.id } });
  assert.equal(pref?.adminCoursesView, "cards");

  await repo.upsertAdminCoursesView(user.id, "list");
  pref = await prisma.userUiPreference.findUnique({ where: { userId: user.id } });
  assert.equal(pref?.adminCoursesView, "list");
});

test("upsertPreferredRole: создаёт и обновляет, не затирая вид", async () => {
  const user = await seedUser("uip-u2");
  await repo.upsertAdminCoursesView(user.id, "table");
  await repo.upsertPreferredRole(user.id, "Ученик");
  const pref = await prisma.userUiPreference.findUnique({ where: { userId: user.id } });
  assert.equal(pref?.preferredRole, "Ученик");
  assert.equal(pref?.adminCoursesView, "table");
});
