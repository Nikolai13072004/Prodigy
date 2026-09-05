import assert from "node:assert/strict";
import { test } from "node:test";
import type { Permission } from "@/lib/roles";
import { PERMISSIONS } from "@/lib/roles";
import { createManageRoleProfiles } from "./manage-role-profiles";
import { RoleProfileApplicationError } from "./role-profile-errors";
import type {
  RoleProfileEffects,
  RoleProfileRecord,
  RoleProfileRepository,
} from "./role-profile-ports";

class FakeUnique extends Error {}

function makeRepository(opts: {
  role?: RoleProfileRecord | null;
  roleProfilesByNames?: Array<{ id: string; name: string }>;
  usersCount?: number;
  throwUnique?: boolean;
}) {
  const state = {
    created: [] as Array<{ name: string }>,
    updated: [] as Array<{ roleId: string; name: string }>,
    renames: [] as Array<{ from: string; to: string }>,
    deleted: [] as string[],
    setUserRoles: [] as Array<{ userId: string; roleProfileIds: string[] }>,
    effects: [] as RoleProfileEffects[],
  };
  const repository: RoleProfileRepository = {
    async findRoleById() {
      return opts.role === undefined
        ? { id: "r1", name: "Manager", isSystem: false, permissionsJson: "[]" }
        : opts.role;
    },
    async loadRoleProfilesByNames(names) {
      return (
        opts.roleProfilesByNames ??
        names.map((name) => ({ id: `rp-${name}`, name }))
      );
    },
    async countUsersWithRole() {
      return opts.usersCount ?? 0;
    },
    async transact(execute) {
      return execute({
        async createRole(data) {
          if (opts.throwUnique) throw new FakeUnique();
          state.created.push({ name: data.name });
          return { id: "new-role", name: data.name };
        },
        async updateRole(input) {
          if (opts.throwUnique) throw new FakeUnique();
          state.updated.push({ roleId: input.roleId, name: input.name });
        },
        async renameUsersRole(from, to) {
          state.renames.push({ from, to });
        },
        async deleteRole(roleId) {
          state.deleted.push(roleId);
        },
        async setUserRole(input) {
          state.setUserRoles.push({
            userId: input.userId,
            roleProfileIds: input.roleProfileIds,
          });
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      });
    },
    isUniqueViolation(error) {
      return error instanceof FakeUnique;
    },
  };
  return { repository, state };
}

const ACTOR = { id: "admin-1", login: null, name: null };
const AUDIT = { ipAddress: null, userAgent: null };
const PERMS: Permission[] = [PERMISSIONS.USERS_VIEW];

test("createRole: пустое имя → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.createRole({ name: "", permissions: PERMS, actor: ACTOR, audit: AUDIT }),
    (e) =>
      e instanceof RoleProfileApplicationError && e.code === "VALIDATION_FAILED",
  );
  assert.equal(state.created.length, 0);
});

test("createRole happy-path: create + audit roles:create", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageRoleProfiles({ repository });
  const result = await m.createRole({
    name: "Manager",
    permissions: PERMS,
    actor: ACTOR,
    audit: AUDIT,
  });
  assert.equal(result.roleId, "new-role");
  assert.equal(state.effects[0].audit?.action, "roles:create");
});

test("createRole: P2002 → NAME_TAKEN", async () => {
  const { repository } = makeRepository({ throwUnique: true });
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.createRole({
      name: "Dup",
      permissions: PERMS,
      actor: ACTOR,
      audit: AUDIT,
    }),
    (e) => e instanceof RoleProfileApplicationError && e.code === "NAME_TAKEN",
  );
});

test("updateRole: системную роль переименовать нельзя → SYSTEM_ROLE_RENAME", async () => {
  const { repository, state } = makeRepository({
    role: { id: "r1", name: "Ученик", isSystem: true, permissionsJson: "[]" },
  });
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.updateRole({
      roleId: "r1",
      name: "Другое имя",
      permissions: PERMS,
      actor: ACTOR,
      audit: AUDIT,
    }),
    (e) =>
      e instanceof RoleProfileApplicationError &&
      e.code === "SYSTEM_ROLE_RENAME",
  );
  assert.equal(state.updated.length, 0);
});

test("updateRole: переименование запускает renameUsersRole", async () => {
  const { repository, state } = makeRepository({
    role: { id: "r1", name: "Старое", isSystem: false, permissionsJson: "[]" },
  });
  const m = createManageRoleProfiles({ repository });
  const result = await m.updateRole({
    roleId: "r1",
    name: "Новое",
    permissions: PERMS,
    actor: ACTOR,
    audit: AUDIT,
  });
  assert.equal(result.renamed, true);
  assert.deepEqual(state.renames, [{ from: "Старое", to: "Новое" }]);
});

test("updateRole: без переименования — renameUsersRole не зовётся", async () => {
  const { repository, state } = makeRepository({
    role: { id: "r1", name: "Имя", isSystem: false, permissionsJson: "[]" },
  });
  const m = createManageRoleProfiles({ repository });
  await m.updateRole({
    roleId: "r1",
    name: "Имя",
    permissions: PERMS,
    actor: ACTOR,
    audit: AUDIT,
  });
  assert.equal(state.renames.length, 0);
});

test("updateRole: роль не найдена → NOT_FOUND", async () => {
  const { repository } = makeRepository({ role: null });
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.updateRole({
      roleId: "missing",
      name: "X",
      permissions: PERMS,
      actor: ACTOR,
      audit: AUDIT,
    }),
    (e) => e instanceof RoleProfileApplicationError && e.code === "NOT_FOUND",
  );
});

test("deleteRole: системную нельзя → SYSTEM_ROLE_DELETE", async () => {
  const { repository, state } = makeRepository({
    role: { id: "r1", name: "Ученик", isSystem: true, permissionsJson: "[]" },
  });
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.deleteRole({ roleId: "r1", actor: ACTOR, audit: AUDIT }),
    (e) =>
      e instanceof RoleProfileApplicationError &&
      e.code === "SYSTEM_ROLE_DELETE",
  );
  assert.equal(state.deleted.length, 0);
});

test("deleteRole: занята пользователями → ROLE_IN_USE", async () => {
  const { repository } = makeRepository({ usersCount: 3 });
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.deleteRole({ roleId: "r1", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof RoleProfileApplicationError && e.code === "ROLE_IN_USE",
  );
});

test("deleteRole happy-path: delete + audit", async () => {
  const { repository, state } = makeRepository({ usersCount: 0 });
  const m = createManageRoleProfiles({ repository });
  await m.deleteRole({ roleId: "r1", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.deleted, ["r1"]);
  assert.equal(state.effects[0].audit?.action, "roles:delete");
});

test("setUserRole: пустая primaryRoleName → NO_ROLE_SELECTED", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.setUserRole({
      userId: "u1",
      roleNames: [],
      primaryRoleName: "",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (e) =>
      e instanceof RoleProfileApplicationError &&
      e.code === "NO_ROLE_SELECTED",
  );
  assert.equal(state.setUserRoles.length, 0);
});

test("setUserRole: неизвестная роль → UNKNOWN_ROLE", async () => {
  const { repository } = makeRepository({
    roleProfilesByNames: [{ id: "rp-A", name: "A" }],
  });
  const m = createManageRoleProfiles({ repository });
  await assert.rejects(
    m.setUserRole({
      userId: "u1",
      roleNames: ["A", "B"],
      primaryRoleName: "A",
      actor: ACTOR,
      audit: AUDIT,
    }),
    (e) => e instanceof RoleProfileApplicationError && e.code === "UNKNOWN_ROLE",
  );
});

test("setUserRole happy-path: setUserRole + audit users:set_roles", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageRoleProfiles({ repository });
  await m.setUserRole({
    userId: "u1",
    roleNames: ["A", "B"],
    primaryRoleName: "A",
    actor: ACTOR,
    audit: AUDIT,
  });
  assert.equal(state.setUserRoles.length, 1);
  assert.deepEqual(state.setUserRoles[0].roleProfileIds, ["rp-A", "rp-B"]);
  assert.equal(state.effects[0].audit?.action, "users:set_roles");
  assert.equal(state.effects[0].audit?.objectType, "user");
});
