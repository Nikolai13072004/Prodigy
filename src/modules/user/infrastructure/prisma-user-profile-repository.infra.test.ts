import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";
import { prismaUserProfileRepository as repo } from "./prisma-user-profile-repository";

// Инфра-тест профиля пользователя против настоящей БД.
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

async function seedRoleProfile(name: string) {
  return prisma.roleProfile.create({
    data: { name, permissionsJson: "[]", isSystem: false },
  });
}

test("loadCurrentUser: возвращает роли из userRoles + role, дедуплицированно", async () => {
  await seedUser("up-load");
  const roleA = await seedRoleProfile("role-A");
  const roleB = await seedRoleProfile("role-B");
  await prisma.userRole.createMany({
    data: [
      { userId: "up-load", roleProfileId: roleA.id },
      { userId: "up-load", roleProfileId: roleB.id },
    ],
  });

  const loaded = await repo.loadCurrentUser("up-load");
  assert.ok(loaded);
  assert.equal(loaded.login, "login-up-load");
  // "Ученик" — базовая роль user.role, плюс roleA/roleB из userRoles
  assert.deepEqual(
    [...loaded.roleNames].sort(),
    ["Ученик", "role-A", "role-B"].sort(),
  );
});

test("loadCurrentUser: отсутствующий → null", async () => {
  const loaded = await repo.loadCurrentUser("missing-user");
  assert.equal(loaded, null);
});

test("loadRoleProfilesByNames: пустой вход → пустой результат", async () => {
  const rows = await repo.loadRoleProfilesByNames([]);
  assert.deepEqual(rows, []);
});

test("loadRoleProfilesByNames: только запрошенные", async () => {
  const roleX = await seedRoleProfile("role-X");
  await seedRoleProfile("role-Y");

  const rows = await repo.loadRoleProfilesByNames(["role-X", "role-missing"]);
  assert.deepEqual(rows.map((r) => r.name), ["role-X"]);
  assert.equal(rows[0].id, roleX.id);
});

test("check*Exists: true для существующих, false для отсутствующих", async () => {
  const group = await prisma.group.create({ data: { name: "grp-1" } });
  const dept = await prisma.department.create({ data: { name: "dep-1" } });
  const org = await prisma.organization.create({ data: { name: "org-1" } });

  assert.equal(await repo.checkGroupExists(group.id), true);
  assert.equal(await repo.checkGroupExists("missing"), false);
  assert.equal(await repo.checkDepartmentExists(dept.id), true);
  assert.equal(await repo.checkDepartmentExists("missing"), false);
  assert.equal(await repo.checkOrganizationExists(org.id), true);
  assert.equal(await repo.checkOrganizationExists("missing"), false);
});

test("applyUpdate: обновляет скаляры, пересобирает роли и одну группу", async () => {
  await seedUser("up-apply", { email: "old@corp.ru" });
  const roleOld = await seedRoleProfile("role-old");
  const roleNew1 = await seedRoleProfile("role-new-1");
  const roleNew2 = await seedRoleProfile("role-new-2");
  const groupOld = await prisma.group.create({ data: { name: "grp-old" } });
  const groupNew = await prisma.group.create({ data: { name: "grp-new" } });
  await prisma.userRole.create({
    data: { userId: "up-apply", roleProfileId: roleOld.id },
  });
  await prisma.groupMembership.create({
    data: { userId: "up-apply", groupId: groupOld.id },
  });

  await repo.transact(async (tx) =>
    tx.applyUpdate({
      userId: "up-apply",
      scalar: {
        name: "Новое Имя",
        firstName: "Новое",
        lastName: "Имя",
        login: "login-up-apply",
        email: "new@corp.ru",
        avatarUrl: null,
        role: "Ученик",
        status: USER_STATUSES.ACTIVE,
        departmentId: null,
        organizationId: null,
      },
      passwordHash: null,
      roleProfileIds: [roleNew1.id, roleNew2.id],
      groupId: groupNew.id,
    }),
  );

  const user = await prisma.user.findUnique({ where: { id: "up-apply" } });
  assert.equal(user?.name, "Новое Имя");
  assert.equal(user?.email, "new@corp.ru");
  assert.equal(user?.passwordHash, "old-hash", "без passwordHash — не трогаем пароль");

  const userRoles = await prisma.userRole.findMany({
    where: { userId: "up-apply" },
    include: { roleProfile: true },
  });
  const roleNames = userRoles.map((r) => r.roleProfile.name).sort();
  assert.deepEqual(roleNames, ["role-new-1", "role-new-2"]);

  const memberships = await prisma.groupMembership.findMany({
    where: { userId: "up-apply" },
  });
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].groupId, groupNew.id);
});

test("applyUpdate с passwordHash: пишет новый хеш и отменяет PENDING PasswordResetToken", async () => {
  await seedUser("up-pass", { email: "pass@corp.ru" });
  await prisma.passwordResetToken.createMany({
    data: [
      {
        userId: "up-pass",
        email: "pass@corp.ru",
        tokenHash: "hash-pending",
        status: "PENDING",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      },
      {
        userId: "up-pass",
        email: "pass@corp.ru",
        tokenHash: "hash-used",
        status: "USED",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      },
    ],
  });

  await repo.transact(async (tx) =>
    tx.applyUpdate({
      userId: "up-pass",
      scalar: {
        name: "User up-pass",
        firstName: "Имя",
        lastName: null,
        login: "login-up-pass",
        email: "pass@corp.ru",
        avatarUrl: null,
        role: "Ученик",
        status: USER_STATUSES.ACTIVE,
        departmentId: null,
        organizationId: null,
      },
      passwordHash: "new-hash",
      roleProfileIds: [],
      groupId: null,
    }),
  );

  const user = await prisma.user.findUnique({ where: { id: "up-pass" } });
  assert.equal(user?.passwordHash, "new-hash");

  const tokens = await prisma.passwordResetToken.findMany({
    where: { userId: "up-pass" },
    orderBy: { tokenHash: "asc" },
  });
  const statuses = Object.fromEntries(
    tokens.map((token) => [token.tokenHash, token.status]),
  );
  assert.equal(statuses["hash-pending"], "CANCELLED");
  assert.equal(statuses["hash-used"], "USED", "не PENDING — не трогаем");
});

test("applyUpdate: пустой roleProfileIds чистит роли, но не падает", async () => {
  await seedUser("up-empty-roles");
  const role = await seedRoleProfile("role-empty-1");
  await prisma.userRole.create({
    data: { userId: "up-empty-roles", roleProfileId: role.id },
  });

  await repo.transact(async (tx) =>
    tx.applyUpdate({
      userId: "up-empty-roles",
      scalar: {
        name: "User up-empty-roles",
        firstName: "Имя",
        lastName: null,
        login: "login-up-empty-roles",
        email: null,
        avatarUrl: null,
        role: "Ученик",
        status: USER_STATUSES.ACTIVE,
        departmentId: null,
        organizationId: null,
      },
      passwordHash: null,
      roleProfileIds: [],
      groupId: null,
    }),
  );

  const remaining = await prisma.userRole.count({
    where: { userId: "up-empty-roles" },
  });
  assert.equal(remaining, 0);
});

test("isUniqueViolation: P2002 → true, прочие ошибки → false", async () => {
  await seedUser("up-uv-1", { email: "dup@corp.ru" });
  await seedUser("up-uv-2");

  let caught: unknown;
  try {
    await prisma.user.update({
      where: { id: "up-uv-2" },
      data: { login: "login-up-uv-1" },
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(repo.isUniqueViolation(caught), true);
  assert.equal(repo.isUniqueViolation(new Error("прочее")), false);
});

test("transact атомарна: throw в execute откатывает applyUpdate", async () => {
  await seedUser("up-tx", { email: "tx@corp.ru" });
  const role = await seedRoleProfile("role-tx");

  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.applyUpdate({
        userId: "up-tx",
        scalar: {
          name: "New",
          firstName: "New",
          lastName: null,
          login: "login-up-tx",
          email: "tx-new@corp.ru",
          avatarUrl: null,
          role: "Ученик",
          status: USER_STATUSES.ACTIVE,
          departmentId: null,
          organizationId: null,
        },
        passwordHash: null,
        roleProfileIds: [role.id],
        groupId: null,
      });
      throw new Error("boom");
    }),
    /boom/,
  );

  const user = await prisma.user.findUnique({ where: { id: "up-tx" } });
  assert.equal(user?.name, "User up-tx", "скаляры не изменились");
  assert.equal(user?.email, "tx@corp.ru");
  const roles = await prisma.userRole.count({ where: { userId: "up-tx" } });
  assert.equal(roles, 0, "роли не пересобрались");
});
