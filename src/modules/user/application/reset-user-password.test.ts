import assert from "node:assert/strict";
import { test } from "node:test";
import { UserApplicationError } from "./errors";
import { createResetUserPassword } from "./reset-user-password";
import type {
  UserCredentialsRecipient,
  UserCredentialsRepository,
} from "./user-credentials-ports";

// Use-case сброса пароля. Аудит намеренно не пишется — метка inviteQueued
// зависит от факта постановки письма в очередь (это уже забота транспорта).

function makeRepository(user: UserCredentialsRecipient | null) {
  const state = {
    resetCalls: [] as Array<{ userId: string; passwordHash: string }>,
  };

  const repository: UserCredentialsRepository = {
    async findUserForPasswordReset() {
      return user;
    },
    async findUserForInvite() {
      return null;
    },
    async transact(execute) {
      return execute({
        async resetPasswordAndCancelResetTokens(userId, passwordHash) {
          state.resetCalls.push({ userId, passwordHash });
        },
        async recordEffects() {},
      });
    },
  };

  return { repository, state };
}

const USER: UserCredentialsRecipient = {
  id: "u1",
  login: "ivan",
  email: "ivan@corp.ru",
  name: "Иван",
  firstName: "Иван",
};

test("happy-path: применяется reset с хешем сгенерированного пароля", async () => {
  const { repository, state } = makeRepository(USER);
  const reset = createResetUserPassword({
    repository,
    hashPassword: async (value) => `hash:${value}`,
  });

  const result = await reset({ userId: "u1", newPassword: "TempPass1" });

  assert.equal(result.user.login, "ivan");
  assert.deepEqual(state.resetCalls, [
    { userId: "u1", passwordHash: "hash:TempPass1" },
  ]);
});

test("not-found → NOT_FOUND", async () => {
  const { repository, state } = makeRepository(null);
  const reset = createResetUserPassword({
    repository,
    hashPassword: async () => "hash",
  });

  await assert.rejects(
    reset({ userId: "missing", newPassword: "TempPass1" }),
    (error) =>
      error instanceof UserApplicationError && error.code === "NOT_FOUND",
  );
  assert.equal(state.resetCalls.length, 0);
});

test("нет email → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository({ ...USER, email: null });
  const reset = createResetUserPassword({
    repository,
    hashPassword: async () => "hash",
  });

  await assert.rejects(
    reset({ userId: "u1", newPassword: "TempPass1" }),
    (error) =>
      error instanceof UserApplicationError &&
      error.code === "VALIDATION_FAILED" &&
      /email/i.test(error.message),
  );
  assert.equal(state.resetCalls.length, 0);
});

test("пустой newPassword → VALIDATION_FAILED", async () => {
  const { repository } = makeRepository(USER);
  const reset = createResetUserPassword({
    repository,
    hashPassword: async () => "hash",
  });

  await assert.rejects(
    reset({ userId: "u1", newPassword: "" }),
    (error) =>
      error instanceof UserApplicationError &&
      error.code === "VALIDATION_FAILED",
  );
});
