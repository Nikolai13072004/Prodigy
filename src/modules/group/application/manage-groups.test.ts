import assert from "node:assert/strict";
import { test } from "node:test";
import { createManageGroups } from "./manage-groups";
import { GroupApplicationError } from "./errors";
import type {
  GroupCardRecord,
  GroupEffects,
  GroupMembershipContext,
  GroupRepository,
} from "./ports";

class FakeUnique extends Error {}

const ACTOR = { id: "admin-1", login: null, name: null };
const AUDIT = { ipAddress: null, userAgent: null };

function makeRepository(opts: {
  card?: GroupCardRecord | null;
  context?: GroupMembershipContext | null;
  eligible?: string[];
  throwUnique?: boolean;
}) {
  const state = {
    created: [] as Array<{ name: string; description: string | null }>,
    updated: [] as Array<{ id: string; name: string }>,
    replaced: [] as Array<{ groupId: string; userIds: string[] }>,
    effects: [] as GroupEffects[],
  };
  const repository: GroupRepository = {
    async findCard() {
      return opts.card === undefined ? { id: "g1", name: "Старое", description: "d" } : opts.card;
    },
    async findMembershipContext() {
      return opts.context === undefined
        ? { id: "g1", name: "Группа", memberUserIds: ["u-old"], courseIds: ["c1"] }
        : opts.context;
    },
    async filterEligibleStudentIds(ids) {
      return opts.eligible ?? ids; // по умолчанию все подходят
    },
    async transact(execute) {
      return execute({
        async createGroup(name, description) {
          if (opts.throwUnique) throw new FakeUnique();
          state.created.push({ name, description });
          return { id: "new-1", name };
        },
        async updateGroup(id, name) {
          if (opts.throwUnique) throw new FakeUnique();
          state.updated.push({ id, name });
        },
        async replaceMemberships(groupId, userIds) {
          state.replaced.push({ groupId, userIds });
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

test("create: пустое имя → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageGroups({ repository });
  await assert.rejects(
    m.create({ name: "", description: null, actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof GroupApplicationError && e.code === "VALIDATION_FAILED",
  );
  assert.equal(state.created.length, 0);
});

test("create happy-path + аудит groups:create", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageGroups({ repository });
  const g = await m.create({ name: "Группа A", description: "опис", actor: ACTOR, audit: AUDIT });
  assert.equal(g.name, "Группа A");
  assert.equal(state.effects[0].audit.action, "groups:create");
});

test("create дубликат → NAME_TAKEN", async () => {
  const { repository } = makeRepository({ throwUnique: true });
  const m = createManageGroups({ repository });
  await assert.rejects(
    m.create({ name: "Дубль", description: null, actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof GroupApplicationError && e.code === "NAME_TAKEN",
  );
});

test("update: не найдено → NOT_FOUND", async () => {
  const { repository, state } = makeRepository({ card: null });
  const m = createManageGroups({ repository });
  await assert.rejects(
    m.update({ id: "missing", name: "X", description: null, actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof GroupApplicationError && e.code === "NOT_FOUND",
  );
  assert.equal(state.updated.length, 0);
});

test("update: аудит содержит previousName/previousDescription", async () => {
  const { repository, state } = makeRepository({
    card: { id: "g1", name: "Старое", description: "старое опис" },
  });
  const m = createManageGroups({ repository });
  await m.update({ id: "g1", name: "Новое", description: "новое", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.effects[0].audit.metadata, {
    previousName: "Старое",
    previousDescription: "старое опис",
    description: "новое",
  });
});

test("setMembers: неактивный/не-ученик среди выбранных → INELIGIBLE_MEMBERS", async () => {
  const { repository, state } = makeRepository({
    context: { id: "g1", name: "Группа", memberUserIds: [], courseIds: [] },
    eligible: ["u1"], // выбрали двоих, подходит один
  });
  const m = createManageGroups({ repository });
  await assert.rejects(
    m.setMembers({ id: "g1", selectedUserIds: ["u1", "u2"], actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof GroupApplicationError && e.code === "INELIGIBLE_MEMBERS",
  );
  assert.equal(state.replaced.length, 0);
});

test("setMembers happy-path: replace + аудит + affected/courseIds для ревалидации", async () => {
  const { repository, state } = makeRepository({
    context: { id: "g1", name: "Группа", memberUserIds: ["u-old"], courseIds: ["c1", "c2"] },
    eligible: ["u1", "u2"],
  });
  const m = createManageGroups({ repository });
  const result = await m.setMembers({ id: "g1", selectedUserIds: ["u1", "u2"], actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.replaced, [{ groupId: "g1", userIds: ["u1", "u2"] }]);
  assert.equal(state.effects[0].audit.action, "groups:set_memberships");
  assert.deepEqual(result.affectedUserIds.sort(), ["u-old", "u1", "u2"].sort());
  assert.deepEqual(result.courseIds, ["c1", "c2"]);
  assert.equal(result.selectedCount, 2);
});

test("setMembers: пустой выбор → очистка без проверки eligibility", async () => {
  const { repository, state } = makeRepository({
    context: { id: "g1", name: "Группа", memberUserIds: ["u-old"], courseIds: [] },
  });
  const m = createManageGroups({ repository });
  const result = await m.setMembers({ id: "g1", selectedUserIds: [], actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.replaced, [{ groupId: "g1", userIds: [] }]);
  assert.equal(result.selectedCount, 0);
});

test("setMembers: группа не найдена → NOT_FOUND", async () => {
  const { repository, state } = makeRepository({ context: null });
  const m = createManageGroups({ repository });
  await assert.rejects(
    m.setMembers({ id: "missing", selectedUserIds: [], actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof GroupApplicationError && e.code === "NOT_FOUND",
  );
  assert.equal(state.replaced.length, 0);
});
