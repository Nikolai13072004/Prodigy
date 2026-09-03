import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaUserImportRepository as repo } from "./prisma-user-import-repository";

// Инфра-тест репозитория CSV-импорта пользователей. Запуск: npm run test:infra.
// Seed-id с префиксом uimp- (глобально уникальны в общей БД).

after(async () => {
  await prisma.$disconnect();
});

test("loadReferenceData: возвращает справочники и занятые email/login", async () => {
  await prisma.user.create({
    data: { id: "uimp-u0", login: "uimp-login-0", name: "U0", email: "uimp-0@e.com", passwordHash: "x" },
  });
  const data = await repo.loadReferenceData();
  assert.ok(data.roleProfiles.every((r) => typeof r.id === "string" && typeof r.name === "string"));
  assert.ok(data.existingUsers.some((u) => u.login === "uimp-login-0" && u.email === "uimp-0@e.com"));
});

test("createImportedUsers: создаёт пользователя с ролью, группой и активацией", async () => {
  const roleProfile = await prisma.roleProfile.create({
    data: { name: "uimp-role", permissionsJson: "[]" },
  });
  const group = await prisma.group.create({ data: { id: "uimp-g1", name: "uimp-group-1" } });

  const created = await repo.createImportedUsers([
    {
      name: "Импорт 1",
      firstName: "Импорт",
      lastName: "Первый",
      login: "uimp-login-1",
      email: "uimp-1@e.com",
      passwordHash: "hash1",
      role: "Ученик",
      status: "PENDING",
      departmentId: null,
      organizationId: null,
      roleProfileIds: [roleProfile.id],
      groupId: group.id,
      activation: { tokenHash: "uimp-token-1", expiresAt: new Date(Date.now() + 1e6), invitedById: "uimp-u0" },
    },
  ]);

  assert.equal(created.length, 1);
  const userId = created[0].id;

  const roles = await prisma.userRole.findMany({ where: { userId } });
  assert.equal(roles.length, 1);
  assert.equal(roles[0].roleProfileId, roleProfile.id);

  const membership = await prisma.groupMembership.findFirst({ where: { userId, groupId: group.id } });
  assert.ok(membership);

  const invite = await prisma.userActivationInvite.findUnique({ where: { userId } });
  assert.equal(invite?.tokenHash, "uimp-token-1");
  assert.equal(invite?.invitedById, "uimp-u0");
});

test("createImportedUsers: без активации — приглашение не создаётся; порядок сохраняется", async () => {
  const created = await repo.createImportedUsers([
    {
      name: "A", firstName: "A", lastName: null, login: "uimp-a", email: "uimp-a@e.com",
      passwordHash: "h", role: "Ученик", status: "ACTIVE",
      departmentId: null, organizationId: null, roleProfileIds: [], groupId: null, activation: null,
    },
    {
      name: "B", firstName: "B", lastName: null, login: "uimp-b", email: "uimp-b@e.com",
      passwordHash: "h", role: "Ученик", status: "ACTIVE",
      departmentId: null, organizationId: null, roleProfileIds: [], groupId: null, activation: null,
    },
  ]);
  assert.deepEqual(created.map((u) => u.login), ["uimp-a", "uimp-b"]);
  const invite = await prisma.userActivationInvite.findUnique({ where: { userId: created[0].id } });
  assert.equal(invite, null);
});

test("createImportedUsers: конфликт login откатывает всю пачку", async () => {
  await prisma.user.create({
    data: { id: "uimp-dup-existing", login: "uimp-dup", name: "Dup", passwordHash: "x" },
  });
  await assert.rejects(
    repo.createImportedUsers([
      {
        name: "OK", firstName: "OK", lastName: null, login: "uimp-ok-rollback", email: "uimp-ok-rb@e.com",
        passwordHash: "h", role: "Ученик", status: "ACTIVE",
        departmentId: null, organizationId: null, roleProfileIds: [], groupId: null, activation: null,
      },
      {
        name: "Dup", firstName: "Dup", lastName: null, login: "uimp-dup", email: "uimp-dup2@e.com",
        passwordHash: "h", role: "Ученик", status: "ACTIVE",
        departmentId: null, organizationId: null, roleProfileIds: [], groupId: null, activation: null,
      },
    ]),
  );
  // первый пользователь не должен сохраниться (откат транзакции)
  const rolledBack = await prisma.user.findUnique({ where: { login: "uimp-ok-rollback" } });
  assert.equal(rolledBack, null);
});
