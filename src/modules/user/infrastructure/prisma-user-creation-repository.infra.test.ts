import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";
import { prismaUserCreationRepository as repo } from "./prisma-user-creation-repository";

// Инфра-тест репозитория создания пользователя против настоящей БД.
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedRoleProfile(name: string) {
  return prisma.roleProfile.create({
    data: { name, permissionsJson: "[]", isSystem: false },
  });
}

test("check*Exists: true для существующих, false для отсутствующих", async () => {
  const group = await prisma.group.create({ data: { name: "uc-grp-1" } });
  const dept = await prisma.department.create({ data: { name: "uc-dep-1" } });
  const org = await prisma.organization.create({ data: { name: "uc-org-1" } });

  assert.equal(await repo.checkGroupExists(group.id), true);
  assert.equal(await repo.checkGroupExists("missing"), false);
  assert.equal(await repo.checkDepartmentExists(dept.id), true);
  assert.equal(await repo.checkDepartmentExists("missing"), false);
  assert.equal(await repo.checkOrganizationExists(org.id), true);
  assert.equal(await repo.checkOrganizationExists("missing"), false);
});

test("loadRoleProfilesByNames: возвращает только запрошенные", async () => {
  const roleX = await seedRoleProfile("uc-role-X");
  await seedRoleProfile("uc-role-Y");

  const rows = await repo.loadRoleProfilesByNames([
    "uc-role-X",
    "uc-role-missing",
  ]);
  assert.deepEqual(rows.map((r) => r.name), ["uc-role-X"]);
  assert.equal(rows[0].id, roleX.id);
});

test("createUser: атомарно создаёт user + userRoles + groupMembership", async () => {
  const role1 = await seedRoleProfile("uc-cr-role-1");
  const role2 = await seedRoleProfile("uc-cr-role-2");
  const group = await prisma.group.create({ data: { name: "uc-cr-grp" } });

  const created = await repo.transact(async (tx) =>
    tx.createUser({
      name: "Иван Петров",
      firstName: "Иван",
      lastName: "Петров",
      login: "uc-cr-login",
      email: "uc-cr@corp.ru",
      passwordHash: "hash-1",
      role: "Ученик",
      status: USER_STATUSES.ACTIVE,
      departmentId: null,
      organizationId: null,
      roleProfileIds: [role1.id, role2.id],
      groupId: group.id,
    }),
  );

  assert.equal(created.login, "uc-cr-login");
  assert.equal(created.email, "uc-cr@corp.ru");

  const roles = await prisma.userRole.findMany({
    where: { userId: created.id },
    include: { roleProfile: { select: { name: true } } },
  });
  const names = roles.map((row) => row.roleProfile.name).sort();
  assert.deepEqual(names, ["uc-cr-role-1", "uc-cr-role-2"]);

  const memberships = await prisma.groupMembership.findMany({
    where: { userId: created.id },
  });
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].groupId, group.id);
});

test("createUser: без groupId — членств не создаёт", async () => {
  const created = await repo.transact(async (tx) =>
    tx.createUser({
      name: "Без Группы",
      firstName: "Без",
      lastName: "Группы",
      login: "uc-nogrp",
      email: null,
      passwordHash: "hash-2",
      role: "Ученик",
      status: USER_STATUSES.ACTIVE,
      departmentId: null,
      organizationId: null,
      roleProfileIds: [],
      groupId: null,
    }),
  );

  const memberships = await prisma.groupMembership.count({
    where: { userId: created.id },
  });
  assert.equal(memberships, 0);
});

test("createActivationInvite: создаёт запись со статусом PENDING по умолчанию", async () => {
  const user = await repo.transact(async (tx) =>
    tx.createUser({
      name: "Инвайт Юзер",
      firstName: "Инвайт",
      lastName: "Юзер",
      login: "uc-inv",
      email: "uc-inv@corp.ru",
      passwordHash: "hash-3",
      role: "Ученик",
      status: USER_STATUSES.PENDING,
      departmentId: null,
      organizationId: null,
      roleProfileIds: [],
      groupId: null,
    }),
  );

  await repo.transact(async (tx) =>
    tx.createActivationInvite({
      userId: user.id,
      email: "uc-inv@corp.ru",
      tokenHash: "uc-tok-hash",
      invitedById: null,
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    }),
  );

  const invite = await prisma.userActivationInvite.findUnique({
    where: { userId: user.id },
  });
  assert.equal(invite?.tokenHash, "uc-tok-hash");
  assert.equal(invite?.status, "PENDING");
});

test("isUniqueViolation: P2002 при дубликате login → true", async () => {
  await repo.transact(async (tx) =>
    tx.createUser({
      name: "First",
      firstName: "First",
      lastName: null,
      login: "uc-dup",
      email: null,
      passwordHash: "h",
      role: "Ученик",
      status: USER_STATUSES.ACTIVE,
      departmentId: null,
      organizationId: null,
      roleProfileIds: [],
      groupId: null,
    }),
  );

  let caught: unknown;
  try {
    await repo.transact(async (tx) =>
      tx.createUser({
        name: "Second",
        firstName: "Second",
        lastName: null,
        login: "uc-dup",
        email: null,
        passwordHash: "h",
        role: "Ученик",
        status: USER_STATUSES.ACTIVE,
        departmentId: null,
        organizationId: null,
        roleProfileIds: [],
        groupId: null,
      }),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(repo.isUniqueViolation(caught), true);
  assert.equal(repo.isUniqueViolation(new Error("прочее")), false);
});

test("transact атомарна: throw откатывает createUser + аудит", async () => {
  const beforeUser = await prisma.user.findUnique({
    where: { login: "uc-tx-boom" },
    select: { id: true },
  });
  assert.equal(beforeUser, null, "чистое стартовое состояние");
  const beforeAudit = await prisma.auditLogEvent.count({
    where: { action: "uc-tx-audit" },
  });

  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.createUser({
        name: "Boom",
        firstName: "Boom",
        lastName: null,
        login: "uc-tx-boom",
        email: null,
        passwordHash: "h",
        role: "Ученик",
        status: USER_STATUSES.ACTIVE,
        departmentId: null,
        organizationId: null,
        roleProfileIds: [],
        groupId: null,
      });
      await tx.recordEffects({
        audit: {
          actorId: null,
          actorLogin: null,
          actorName: null,
          action: "uc-tx-audit",
          objectType: "user",
          objectId: null,
          objectLabel: null,
          ipAddress: null,
          userAgent: null,
          metadata: null,
        },
      });
      throw new Error("boom");
    }),
    /boom/,
  );

  const afterUser = await prisma.user.findUnique({
    where: { login: "uc-tx-boom" },
    select: { id: true },
  });
  assert.equal(afterUser, null, "user не создался");
  const afterAudit = await prisma.auditLogEvent.count({
    where: { action: "uc-tx-audit" },
  });
  assert.equal(afterAudit, beforeAudit, "аудит не записался");
});
