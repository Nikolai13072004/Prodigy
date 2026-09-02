import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";
import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { prismaGroupRepository as repo } from "./prisma-group-repository";

// Инфра-тест репозитория групп. Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedStudent(id: string, status = USER_STATUSES.ACTIVE, role = STANDARD_ROLE_NAMES.STUDENT) {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `U ${id}`, passwordHash: "x", role, status },
  });
}

test("create + findCard, update меняет имя/описание", async () => {
  const g = await repo.transact((tx) => tx.createGroup("grp-crud", "desc"));
  const card = await repo.findCard(g.id);
  assert.equal(card?.name, "grp-crud");
  assert.equal(card?.description, "desc");

  await repo.transact((tx) => tx.updateGroup(g.id, "grp-crud-new", null));
  const card2 = await repo.findCard(g.id);
  assert.equal(card2?.name, "grp-crud-new");
  assert.equal(card2?.description, null);
});

test("replaceMemberships: заменяет состав целиком", async () => {
  const g = await repo.transact((tx) => tx.createGroup("grp-mem", null));
  await seedStudent("grp-u1");
  await seedStudent("grp-u2");
  await seedStudent("grp-u3");

  await repo.transact((tx) => tx.replaceMemberships(g.id, ["grp-u1", "grp-u2"]));
  let ctx = await repo.findMembershipContext(g.id);
  assert.deepEqual(ctx?.memberUserIds.sort(), ["grp-u1", "grp-u2"]);

  // повторная замена вытесняет прежних
  await repo.transact((tx) => tx.replaceMemberships(g.id, ["grp-u3"]));
  ctx = await repo.findMembershipContext(g.id);
  assert.deepEqual(ctx?.memberUserIds, ["grp-u3"]);

  // пустой список — очистка
  await repo.transact((tx) => tx.replaceMemberships(g.id, []));
  ctx = await repo.findMembershipContext(g.id);
  assert.equal(ctx?.memberUserIds.length, 0);
});

test("filterEligibleStudentIds: только активные ученики", async () => {
  const active = await seedStudent("grp-active");
  const blocked = await seedStudent("grp-blocked", USER_STATUSES.BLOCKED);
  const archived = await seedStudent("grp-archived", USER_STATUSES.ARCHIVED);
  const nonStudent = await seedStudent("grp-hr", USER_STATUSES.ACTIVE, "HR");
  // ученик по userRoles (role != STUDENT, но профиль есть)
  const roleProfile = await prisma.roleProfile.findUnique({ where: { name: STANDARD_ROLE_NAMES.STUDENT } })
    ?? await prisma.roleProfile.create({ data: { name: STANDARD_ROLE_NAMES.STUDENT, permissionsJson: "[]", isSystem: true } });
  const viaRoles = await seedStudent("grp-via-roles", USER_STATUSES.ACTIVE, "USER");
  await prisma.userRole.create({ data: { userId: viaRoles.id, roleProfileId: roleProfile.id } });

  const eligible = await repo.filterEligibleStudentIds([
    active.id, blocked.id, archived.id, nonStudent.id, viaRoles.id,
  ]);
  assert.deepEqual(eligible.sort(), ["grp-active", "grp-via-roles"].sort());
});

test("filterEligibleStudentIds: пустой вход → пусто", async () => {
  assert.deepEqual(await repo.filterEligibleStudentIds([]), []);
});

test("isUniqueViolation: дубликат name → P2002 → true", async () => {
  await repo.transact((tx) => tx.createGroup("grp-dup", null));
  let caught: unknown;
  try {
    await repo.transact((tx) => tx.createGroup("grp-dup", null));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(repo.isUniqueViolation(caught), true);
});

test("transact атомарна: throw откатывает создание группы", async () => {
  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.createGroup("grp-rollback", null);
      throw new Error("boom");
    }),
    /boom/,
  );
  const found = await prisma.group.findFirst({ where: { name: "grp-rollback" } });
  assert.equal(found, null);
});
