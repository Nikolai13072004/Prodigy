import assert from "node:assert/strict";
import { test } from "node:test";
import { createCompleteAdminTotpSetup } from "./complete-admin-totp-setup";
import type { UserTotpRepository } from "./complete-admin-totp-setup";

function makeRepository() {
  const state = { upserts: [] as { userId: string; secretCiphertext: string; recoveryCodesJson: string }[] };
  const repository: UserTotpRepository = {
    async upsertTotpCredential(input) {
      state.upserts.push(input);
    },
  };
  return { repository, state };
}

const CRYPTO = {
  generateRecoveryCodes: () => ["code-1", "code-2", "code-3"],
  encryptTotpSecret: (secret: string) => `enc(${secret})`,
  hashRecoveryCode: (code: string) => `hash(${code})`,
};

test("неверный код → ok:false, репозиторий не тронут", async () => {
  const { repository, state } = makeRepository();
  const run = createCompleteAdminTotpSetup({
    repository,
    verifyTotpCode: () => false,
    ...CRYPTO,
  });
  const res = await run({ userId: "u-1", secret: "SECRET", code: "000000" });
  assert.deepEqual(res, { ok: false, reason: "INVALID_CODE" });
  assert.equal(state.upserts.length, 0);
});

test("верный код → ok:true, сохранён шифр секрета и хеши recovery-кодов", async () => {
  const { repository, state } = makeRepository();
  let verifiedWith: [string, string] | null = null;
  const run = createCompleteAdminTotpSetup({
    repository,
    verifyTotpCode: (secret, code) => {
      verifiedWith = [secret, code];
      return true;
    },
    ...CRYPTO,
  });
  const res = await run({ userId: "u-1", secret: "SECRET", code: "123456" });
  assert.equal(res.ok, true);
  assert.deepEqual(verifiedWith, ["SECRET", "123456"]);
  assert.deepEqual(res.ok && res.recoveryCodes, ["code-1", "code-2", "code-3"]);
  assert.equal(state.upserts.length, 1);
  assert.equal(state.upserts[0].userId, "u-1");
  assert.equal(state.upserts[0].secretCiphertext, "enc(SECRET)");
  assert.deepEqual(JSON.parse(state.upserts[0].recoveryCodesJson), [
    "hash(code-1)",
    "hash(code-2)",
    "hash(code-3)",
  ]);
});
