import assert from "node:assert/strict";
import { test } from "node:test";
import { createManageOrgEntity } from "./manage-org-entity";
import { OrgStructureApplicationError } from "./errors";
import type {
  OrgEntityEffects,
  OrgEntityRecord,
  OrgEntityRepository,
} from "./ports";

class FakeUnique extends Error {}

const KIND = {
  objectType: "department",
  auditPrefix: "departments",
  requiredMessage: "Название подразделения обязательно",
  notFoundMessage: "Подразделение не найдено",
  takenMessage: "Подразделение с таким названием уже существует",
};
const ACTOR = { id: "admin-1", login: null, name: null };
const AUDIT = { ipAddress: null, userAgent: null };

function makeRepository(opts: {
  existing?: OrgEntityRecord | null;
  throwUnique?: boolean;
}) {
  const state = {
    created: [] as string[],
    updated: [] as Array<{ id: string; name: string }>,
    removed: [] as string[],
    effects: [] as OrgEntityEffects[],
  };
  const repository: OrgEntityRepository = {
    async findById() {
      return opts.existing === undefined
        ? { id: "d1", name: "Старое" }
        : opts.existing;
    },
    async transact(execute) {
      return execute({
        async create(name) {
          if (opts.throwUnique) throw new FakeUnique();
          state.created.push(name);
          return { id: "new-1", name };
        },
        async update(id, name) {
          if (opts.throwUnique) throw new FakeUnique();
          state.updated.push({ id, name });
        },
        async remove(id) {
          state.removed.push(id);
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

test("create: пустое имя → VALIDATION_FAILED, без записи", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageOrgEntity({ repository, kind: KIND });
  await assert.rejects(
    m.create({ name: "", actor: ACTOR, audit: AUDIT }),
    (e) =>
      e instanceof OrgStructureApplicationError &&
      e.code === "VALIDATION_FAILED",
  );
  assert.equal(state.created.length, 0);
});

test("create happy-path: create + аудит departments:create", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageOrgEntity({ repository, kind: KIND });
  const rec = await m.create({ name: "Финансы", actor: ACTOR, audit: AUDIT });
  assert.equal(rec.name, "Финансы");
  assert.deepEqual(state.created, ["Финансы"]);
  assert.equal(state.effects[0].audit.action, "departments:create");
  assert.equal(state.effects[0].audit.objectType, "department");
});

test("create: дубликат имени → NAME_TAKEN", async () => {
  const { repository } = makeRepository({ throwUnique: true });
  const m = createManageOrgEntity({ repository, kind: KIND });
  await assert.rejects(
    m.create({ name: "Финансы", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof OrgStructureApplicationError && e.code === "NAME_TAKEN",
  );
});

test("update: не найдено → NOT_FOUND", async () => {
  const { repository, state } = makeRepository({ existing: null });
  const m = createManageOrgEntity({ repository, kind: KIND });
  await assert.rejects(
    m.update({ id: "missing", name: "X", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof OrgStructureApplicationError && e.code === "NOT_FOUND",
  );
  assert.equal(state.updated.length, 0);
});

test("update happy-path: update + аудит с previousName", async () => {
  const { repository, state } = makeRepository({
    existing: { id: "d1", name: "Старое" },
  });
  const m = createManageOrgEntity({ repository, kind: KIND });
  await m.update({ id: "d1", name: "Новое", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.updated, [{ id: "d1", name: "Новое" }]);
  const audit = state.effects[0].audit;
  assert.equal(audit.action, "departments:update");
  assert.deepEqual(audit.metadata, { previousName: "Старое" });
});

test("remove: не найдено → NOT_FOUND", async () => {
  const { repository, state } = makeRepository({ existing: null });
  const m = createManageOrgEntity({ repository, kind: KIND });
  await assert.rejects(
    m.remove({ id: "missing", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof OrgStructureApplicationError && e.code === "NOT_FOUND",
  );
  assert.equal(state.removed.length, 0);
});

test("remove happy-path: delete + аудит departments:delete", async () => {
  const { repository, state } = makeRepository({
    existing: { id: "d1", name: "Финансы" },
  });
  const m = createManageOrgEntity({ repository, kind: KIND });
  const rec = await m.remove({ id: "d1", actor: ACTOR, audit: AUDIT });
  assert.equal(rec.name, "Финансы");
  assert.deepEqual(state.removed, ["d1"]);
  assert.equal(state.effects[0].audit.action, "departments:delete");
});

test("kind параметризует сообщения/префикс (organization)", async () => {
  const { repository, state } = makeRepository({});
  const m = createManageOrgEntity({
    repository,
    kind: {
      objectType: "organization",
      auditPrefix: "organizations",
      requiredMessage: "Название организации обязательно",
      notFoundMessage: "Организация не найдена",
      takenMessage: "Организация с таким названием уже существует",
    },
  });
  await m.create({ name: "ООО Ромашка", actor: ACTOR, audit: AUDIT });
  assert.equal(state.effects[0].audit.action, "organizations:create");
  assert.equal(state.effects[0].audit.objectType, "organization");
  await assert.rejects(
    m.create({ name: "", actor: ACTOR, audit: AUDIT }),
    (e) =>
      e instanceof OrgStructureApplicationError &&
      /организации/i.test(e.message),
  );
});
