import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRequestPasswordReset,
  createResetPasswordWithToken,
} from "./self-service-password-reset";
import { SelfServicePasswordResetError } from "./self-service-password-reset-errors";
import type {
  ResetRequestUser,
  ResetTokenRecord,
  SelfServicePasswordResetRepository,
} from "./self-service-password-reset-ports";

function makeRepository(opts: {
  user?: ResetRequestUser | null;
  reset?: ResetTokenRecord | null;
}) {
  const state = {
    issued: [] as string[],
    expired: [] as string[],
    applied: [] as { userId: string; currentStatus: string; tokenId: string }[],
  };
  const repository: SelfServicePasswordResetRepository = {
    async findUserByIdentifiers() {
      return opts.user === undefined ? null : opts.user;
    },
    async issueResetToken(input) {
      state.issued.push(input.userId);
    },
    async findResetByToken() {
      return opts.reset === undefined ? null : opts.reset;
    },
    async markResetExpired(id) {
      state.expired.push(id);
    },
    async applyPasswordReset(input) {
      state.applied.push({
        userId: input.userId,
        currentStatus: input.currentStatus,
        tokenId: input.tokenId,
      });
    },
  };
  return { repository, state };
}

const REQUEST = {
  identifierVariants: ["ivan", "IVAN"],
  tokenHash: "hash",
  expiresAt: new Date(Date.now() + 60_000),
};

function activeUser(overrides: Partial<ResetRequestUser> = {}): ResetRequestUser {
  return {
    id: "u-1",
    email: "u@example.com",
    login: "ivan",
    name: "Иван",
    firstName: "Иван",
    status: "ACTIVE",
    ...overrides,
  };
}

test("request: активный с email → issued=true, токен записан", async () => {
  const { repository, state } = makeRepository({ user: activeUser() });
  const run = createRequestPasswordReset({ repository });
  const res = await run(REQUEST);
  assert.equal(res.issued, true);
  assert.equal(res.user?.id, "u-1");
  assert.deepEqual(state.issued, ["u-1"]);
});

test("request: пользователь без email → issued=false, токен не записан", async () => {
  const { repository, state } = makeRepository({ user: activeUser({ email: null }) });
  const run = createRequestPasswordReset({ repository });
  const res = await run(REQUEST);
  assert.equal(res.issued, false);
  assert.equal(res.user?.id, "u-1");
  assert.equal(state.issued.length, 0);
});

test("request: заблокированный пользователь → issued=false", async () => {
  const { repository, state } = makeRepository({ user: activeUser({ status: "BLOCKED" }) });
  const run = createRequestPasswordReset({ repository });
  const res = await run(REQUEST);
  assert.equal(res.issued, false);
  assert.equal(state.issued.length, 0);
});

test("request: пользователь не найден → issued=false, user=null", async () => {
  const { repository } = makeRepository({ user: null });
  const run = createRequestPasswordReset({ repository });
  const res = await run(REQUEST);
  assert.equal(res.issued, false);
  assert.equal(res.user, null);
});

function pendingReset(overrides: Partial<ResetTokenRecord> = {}): ResetTokenRecord {
  return {
    id: "rt-1",
    userId: "u-1",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: "u-1", name: "Иван", login: "ivan", email: "u@example.com", status: "ACTIVE" },
    ...overrides,
  };
}

test("reset: токен не найден → NOT_FOUND", async () => {
  const { repository } = makeRepository({ reset: null });
  const run = createResetPasswordWithToken({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) => e instanceof SelfServicePasswordResetError && e.code === "NOT_FOUND",
  );
});

test("reset: токен уже использован → NOT_PENDING", async () => {
  const { repository } = makeRepository({ reset: pendingReset({ status: "USED" }) });
  const run = createResetPasswordWithToken({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) => e instanceof SelfServicePasswordResetError && e.code === "NOT_PENDING",
  );
});

test("reset: токен просрочен → EXPIRED + пометка EXPIRED", async () => {
  const { repository, state } = makeRepository({
    reset: pendingReset({ expiresAt: new Date(Date.now() - 60_000) }),
  });
  const run = createResetPasswordWithToken({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) => e instanceof SelfServicePasswordResetError && e.code === "EXPIRED",
  );
  assert.deepEqual(state.expired, ["rt-1"]);
  assert.equal(state.applied.length, 0);
});

test("reset: доступ отозван → ACCESS_REVOKED", async () => {
  const { repository } = makeRepository({
    reset: pendingReset({ user: { id: "u-1", name: "И", login: "ivan", email: null, status: "ARCHIVED" } }),
  });
  const run = createResetPasswordWithToken({ repository, hashPassword: async () => "h" });
  await assert.rejects(
    run({ token: "t", password: "secret1" }),
    (e) => e instanceof SelfServicePasswordResetError && e.code === "ACCESS_REVOKED",
  );
});

test("reset happy-path: хеш + applyPasswordReset + возврат user/tokenId", async () => {
  const { repository, state } = makeRepository({ reset: pendingReset() });
  let hashedWith = "";
  const run = createResetPasswordWithToken({
    repository,
    hashPassword: async (p) => {
      hashedWith = p;
      return `hash:${p}`;
    },
  });
  const res = await run({ token: "t", password: "secret1" });
  assert.equal(hashedWith, "secret1");
  assert.equal(res.user.id, "u-1");
  assert.equal(res.tokenId, "rt-1");
  assert.deepEqual(state.applied, [{ userId: "u-1", currentStatus: "ACTIVE", tokenId: "rt-1" }]);
});
