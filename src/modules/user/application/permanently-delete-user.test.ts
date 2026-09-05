import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_STATUSES } from "@/lib/users";
import { UserApplicationError } from "./errors";
import { createPermanentlyDeleteUser } from "./permanently-delete-user";
import type {
  UserLifecycleEffects,
  UserLifecycleRepository,
  UserLifecycleTransaction,
  UserRecord,
} from "./ports";

// Use-case окончательного удаления. Проверяем через фейковый репозиторий:
// self-block, not-found, ARCHIVED-only, каскадные подчистки (только когда есть
// email), аудит записан.

function makeRepository(user: UserRecord | null) {
  const state = {
    hardDeleted: [] as string[],
    emailJobsDeleted: [] as string[],
    invitesByEmailDeleted: [] as string[],
    invitesByAcceptedDeleted: [] as string[],
    effects: [] as UserLifecycleEffects[],
  };

  const repository: UserLifecycleRepository = {
    async transact(execute) {
      const tx: UserLifecycleTransaction = {
        async findUsersByIds(ids) {
          if (!user) return [];
          return ids.includes(user.id) ? [user] : [];
        },
        async changeUserStatuses() {},
        async cancelPendingInvites() {},
        async deleteUserEmailJobsByEmail(email) {
          state.emailJobsDeleted.push(email);
        },
        async deleteCourseInvitesByEmail(email) {
          state.invitesByEmailDeleted.push(email);
        },
        async deleteCourseInvitesByAcceptedUserId(userId) {
          state.invitesByAcceptedDeleted.push(userId);
        },
        async hardDeleteUser(userId) {
          state.hardDeleted.push(userId);
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      };
      return execute(tx);
    },
  };

  return { repository, state };
}

const AUDIT = {
  actorId: "admin-1",
  actorLogin: "admin@corp.ru",
  actorName: "Админ",
  ipAddress: null,
  userAgent: null,
};

const ARCHIVED: UserRecord = {
  id: "u1",
  login: "ivan",
  email: "ivan@corp.ru",
  name: "Иван",
  status: USER_STATUSES.ARCHIVED,
};

test("успех: чистим email jobs, invite'ы, удаляем user, пишем audit", async () => {
  const { repository, state } = makeRepository(ARCHIVED);
  const permanentlyDelete = createPermanentlyDeleteUser({ repository });

  await permanentlyDelete({
    userId: "u1",
    currentUserId: "admin-1",
    audit: AUDIT,
  });

  assert.deepEqual(state.emailJobsDeleted, ["ivan@corp.ru"]);
  assert.deepEqual(state.invitesByEmailDeleted, ["ivan@corp.ru"]);
  assert.deepEqual(state.invitesByAcceptedDeleted, ["u1"]);
  assert.deepEqual(state.hardDeleted, ["u1"]);
  assert.equal(state.effects[0].audit?.action, "users:delete_permanently");
});

test("без email: пропускаем чистку по email, удаляем всё равно", async () => {
  const { repository, state } = makeRepository({ ...ARCHIVED, email: null });
  const permanentlyDelete = createPermanentlyDeleteUser({ repository });

  await permanentlyDelete({
    userId: "u1",
    currentUserId: "admin-1",
    audit: AUDIT,
  });

  assert.equal(state.emailJobsDeleted.length, 0);
  assert.equal(state.invitesByEmailDeleted.length, 0);
  assert.deepEqual(state.invitesByAcceptedDeleted, ["u1"]);
  assert.deepEqual(state.hardDeleted, ["u1"]);
});

test("self-block: удалить себя нельзя", async () => {
  const { repository, state } = makeRepository(ARCHIVED);
  const permanentlyDelete = createPermanentlyDeleteUser({ repository });

  await assert.rejects(
    permanentlyDelete({ userId: "u1", currentUserId: "u1", audit: AUDIT }),
    (error) =>
      error instanceof UserApplicationError && error.code === "SELF_BLOCK",
  );
  assert.equal(state.hardDeleted.length, 0);
});

test("not-found → NOT_FOUND", async () => {
  const { repository, state } = makeRepository(null);
  const permanentlyDelete = createPermanentlyDeleteUser({ repository });

  await assert.rejects(
    permanentlyDelete({
      userId: "missing",
      currentUserId: "admin-1",
      audit: AUDIT,
    }),
    (error) =>
      error instanceof UserApplicationError && error.code === "NOT_FOUND",
  );
  assert.equal(state.hardDeleted.length, 0);
});

test("не архивирован → VALIDATION_FAILED, никакого удаления", async () => {
  const active: UserRecord = { ...ARCHIVED, status: USER_STATUSES.ACTIVE };
  const { repository, state } = makeRepository(active);
  const permanentlyDelete = createPermanentlyDeleteUser({ repository });

  await assert.rejects(
    permanentlyDelete({
      userId: "u1",
      currentUserId: "admin-1",
      audit: AUDIT,
    }),
    (error) =>
      error instanceof UserApplicationError &&
      error.code === "VALIDATION_FAILED" &&
      /архивированного/i.test(error.message),
  );
  assert.equal(state.hardDeleted.length, 0);
  assert.equal(state.effects.length, 0);
});
