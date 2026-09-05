import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_STATUSES } from "@/lib/users";
import { UserApplicationError } from "./errors";
import { createSendUserInvite } from "./send-user-invite";
import type {
  UserCredentialsInviteRecipient,
  UserCredentialsRepository,
} from "./user-credentials-ports";

// Use-case отправки приглашения. HR может слать только ученикам; архивным
// нельзя. Аудит остаётся на транспорте — здесь только мутация.

function makeRepository(user: UserCredentialsInviteRecipient | null) {
  const state = {
    resetCalls: [] as Array<{ userId: string; passwordHash: string }>,
  };

  const repository: UserCredentialsRepository = {
    async findUserForPasswordReset() {
      return null;
    },
    async findUserForInvite() {
      return user;
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

function makeUser(
  overrides: Partial<UserCredentialsInviteRecipient> = {},
): UserCredentialsInviteRecipient {
  return {
    id: "u1",
    login: "ivan",
    email: "ivan@corp.ru",
    name: "Иван",
    firstName: "Иван",
    status: USER_STATUSES.ACTIVE,
    roleNames: ["Ученик"],
    ...overrides,
  };
}

test("админ (canEditAccessLevel=true): сбрасывает пароль и вернёт user", async () => {
  const { repository, state } = makeRepository(makeUser({ roleNames: ["HR"] }));
  const invite = createSendUserInvite({
    repository,
    hashPassword: async (value) => `hash:${value}`,
  });

  const result = await invite({
    userId: "u1",
    canEditAccessLevel: true,
    newPassword: "TempPass1",
  });

  assert.equal(result.user.id, "u1");
  assert.deepEqual(state.resetCalls, [
    { userId: "u1", passwordHash: "hash:TempPass1" },
  ]);
});

test("HR + не-ученик → HR_FORBIDDEN, никакой мутации", async () => {
  const { repository, state } = makeRepository(makeUser({ roleNames: ["HR"] }));
  const invite = createSendUserInvite({
    repository,
    hashPassword: async () => "hash",
  });

  await assert.rejects(
    invite({
      userId: "u1",
      canEditAccessLevel: false,
      newPassword: "TempPass1",
    }),
    (error) =>
      error instanceof UserApplicationError && error.code === "HR_FORBIDDEN",
  );
  assert.equal(state.resetCalls.length, 0);
});

test("HR + ученик: разрешено", async () => {
  const { repository, state } = makeRepository(makeUser({ roleNames: ["Ученик"] }));
  const invite = createSendUserInvite({
    repository,
    hashPassword: async () => "hash",
  });

  await invite({
    userId: "u1",
    canEditAccessLevel: false,
    newPassword: "TempPass1",
  });
  assert.equal(state.resetCalls.length, 1);
});

test("архивированный → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository(
    makeUser({ status: USER_STATUSES.ARCHIVED }),
  );
  const invite = createSendUserInvite({
    repository,
    hashPassword: async () => "hash",
  });

  await assert.rejects(
    invite({
      userId: "u1",
      canEditAccessLevel: true,
      newPassword: "TempPass1",
    }),
    (error) =>
      error instanceof UserApplicationError &&
      error.code === "VALIDATION_FAILED" &&
      /архивированному/i.test(error.message),
  );
  assert.equal(state.resetCalls.length, 0);
});

test("без email → VALIDATION_FAILED", async () => {
  const { repository, state } = makeRepository(makeUser({ email: null }));
  const invite = createSendUserInvite({
    repository,
    hashPassword: async () => "hash",
  });

  await assert.rejects(
    invite({
      userId: "u1",
      canEditAccessLevel: true,
      newPassword: "TempPass1",
    }),
    (error) =>
      error instanceof UserApplicationError &&
      error.code === "VALIDATION_FAILED" &&
      /email/i.test(error.message),
  );
  assert.equal(state.resetCalls.length, 0);
});

test("not-found → NOT_FOUND", async () => {
  const { repository, state } = makeRepository(null);
  const invite = createSendUserInvite({
    repository,
    hashPassword: async () => "hash",
  });

  await assert.rejects(
    invite({
      userId: "missing",
      canEditAccessLevel: true,
      newPassword: "TempPass1",
    }),
    (error) =>
      error instanceof UserApplicationError && error.code === "NOT_FOUND",
  );
  assert.equal(state.resetCalls.length, 0);
});
