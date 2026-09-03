import assert from "node:assert/strict";
import { test } from "node:test";
import { createActivateUserAccount } from "./activate-user-account";
import { ActivateUserAccountError } from "./activate-user-account-errors";
import type {
  ActivationInviteRecord,
  UserActivationRepository,
} from "./activate-user-account-ports";

function makeRepository(opts: { invite?: ActivationInviteRecord | null }) {
  const state = { expired: [] as string[], activated: [] as { userId: string; inviteId: string }[] };
  const repository: UserActivationRepository = {
    async findActivationByToken() {
      return opts.invite === undefined ? pendingInvite() : opts.invite;
    },
    async markActivationExpired(id) {
      state.expired.push(id);
    },
    async activateAccount(input) {
      state.activated.push({ userId: input.userId, inviteId: input.inviteId });
    },
  };
  return { repository, state };
}

function pendingInvite(overrides: Partial<ActivationInviteRecord> = {}): ActivationInviteRecord {
  return {
    id: "ai-1",
    userId: "u-1",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: "u-1", name: "Иван", login: "ivan", email: "u@example.com", status: "PENDING" },
    ...overrides,
  };
}

test("токен не найден → NOT_FOUND", async () => {
  const { repository } = makeRepository({ invite: null });
  const run = createActivateUserAccount({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) => e instanceof ActivateUserAccountError && e.code === "NOT_FOUND",
  );
});

test("уже использована → NOT_PENDING (accepted)", async () => {
  const { repository } = makeRepository({ invite: pendingInvite({ status: "ACCEPTED" }) });
  const run = createActivateUserAccount({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) =>
      e instanceof ActivateUserAccountError &&
      e.code === "NOT_PENDING" &&
      e.message.includes("уже использована"),
  );
});

test("отозвана → NOT_PENDING (иная)", async () => {
  const { repository } = makeRepository({ invite: pendingInvite({ status: "REVOKED" }) });
  const run = createActivateUserAccount({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) =>
      e instanceof ActivateUserAccountError &&
      e.code === "NOT_PENDING" &&
      e.message.includes("больше не активна"),
  );
});

test("просрочена → EXPIRED + пометка", async () => {
  const { repository, state } = makeRepository({
    invite: pendingInvite({ expiresAt: new Date(Date.now() - 60_000) }),
  });
  const run = createActivateUserAccount({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) => e instanceof ActivateUserAccountError && e.code === "EXPIRED",
  );
  assert.deepEqual(state.expired, ["ai-1"]);
  assert.equal(state.activated.length, 0);
});

test("happy-path: хеш + activateAccount + возврат user/inviteId", async () => {
  const { repository, state } = makeRepository({ invite: pendingInvite() });
  let hashedWith = "";
  const run = createActivateUserAccount({
    repository,
    hashPassword: async (p) => {
      hashedWith = p;
      return `hash:${p}`;
    },
  });
  const res = await run({ token: "t", password: "secret1" });
  assert.equal(hashedWith, "secret1");
  assert.equal(res.user.id, "u-1");
  assert.equal(res.inviteId, "ai-1");
  assert.deepEqual(state.activated, [{ userId: "u-1", inviteId: "ai-1" }]);
});
