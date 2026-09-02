import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaRoleProfileRepository as repo } from "./prisma-role-profile-repository";

// Инфра-тест репозитория ролей против настоящей БД. Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

async function seedRole(name: string, isSystem = false) {
  return prisma.roleProfile.create({
    data: { name, permissionsJson: "[]", isSystem },
  });
}

async function seedUser(id: string, role = "Ученик") {
  return prisma.user.create({
    data: { id, login: `login-${id}`, name: `User ${id}`, passwordHash: "x", role },
  });
}

test("createRole + findRoleById", async () => {
  const created = await repo.transact(async (tx) =>
    tx.createRole({ name: "rp-create", permissionsJson: '["users.view"]' }),
  );
  const found = await repo.findRoleById(created.id);
  assert.equal(found?.name, "rp-create");
  assert.equal(found?.isSystem, false);
});

test("updateRole + renameUsersRole: денормализованный User.role тоже меняется", async () => {
  const role = await seedRole("rp-old-name");
  await seedUser("rp-u-1", "rp-old-name");
  await seedUser("rp-u-2", "другая");

  await repo.transact(async (tx) => {
    await tx.updateRole({
      roleId: role.id,
      name: "rp-new-name",
      permissionsJson: "[]",
    });
    await tx.renameUsersRole("rp-old-name", "rp-new-name");
  });

  const u1 = await prisma.user.findUnique({ where: { id: "rp-u-1" } });
  const u2 = await prisma.user.findUnique({ where: { id: "rp-u-2" } });
  assert.equal(u1?.role, "rp-new-name");
  assert.equal(u2?.role, "другая", "чужая роль не тронута");
});

test("countUsersWithRole: считает и по User.role, и по userRoles", async () => {
  const role = await seedRole("rp-count");
  await seedUser("rp-cu-1", "rp-count");
  const other = await seedUser("rp-cu-2", "иное");
  await prisma.userRole.create({
    data: { userId: other.id, roleProfileId: role.id },
  });

  const count = await repo.countUsersWithRole(role.id, "rp-count");
  assert.equal(count, 2, "один по role, один по userRoles");
});

test("deleteRole удаляет запись", async () => {
  const role = await seedRole("rp-del");
  await repo.transact(async (tx) => tx.deleteRole(role.id));
  const found = await repo.findRoleById(role.id);
  assert.equal(found, null);
});

test("setUserRole: обновляет role и пересобирает userRoles", async () => {
  const roleA = await seedRole("rp-set-A");
  const roleB = await seedRole("rp-set-B");
  const oldRole = await seedRole("rp-set-old");
  await seedUser("rp-set-u", "старое");
  await prisma.userRole.create({
    data: { userId: "rp-set-u", roleProfileId: oldRole.id },
  });

  await repo.transact(async (tx) =>
    tx.setUserRole({
      userId: "rp-set-u",
      primaryRoleName: "rp-set-A",
      roleProfileIds: [roleA.id, roleB.id],
    }),
  );

  const user = await prisma.user.findUnique({
    where: { id: "rp-set-u" },
    select: { role: true },
  });
  assert.equal(user?.role, "rp-set-A");
  const links = await prisma.userRole.findMany({
    where: { userId: "rp-set-u" },
    include: { roleProfile: { select: { name: true } } },
  });
  const names = links.map((l) => l.roleProfile.name).sort();
  assert.deepEqual(names, ["rp-set-A", "rp-set-B"]);
});

test("isUniqueViolation: дубликат name → P2002 → true", async () => {
  await seedRole("rp-dup");
  let caught: unknown;
  try {
    await repo.transact(async (tx) =>
      tx.createRole({ name: "rp-dup", permissionsJson: "[]" }),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(repo.isUniqueViolation(caught), true);
  assert.equal(repo.isUniqueViolation(new Error("прочее")), false);
});

test("transact атомарна: throw откатывает updateRole", async () => {
  const role = await seedRole("rp-tx");
  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.updateRole({
        roleId: role.id,
        name: "rp-tx-changed",
        permissionsJson: "[]",
      });
      throw new Error("boom");
    }),
    /boom/,
  );
  const found = await repo.findRoleById(role.id);
  assert.equal(found?.name, "rp-tx", "имя не изменилось");
});
