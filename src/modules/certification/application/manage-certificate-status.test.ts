import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CertificateStatusError,
  createManageCertificateStatus,
} from "./manage-certificate-status";
import type {
  CertificateStatusRecord,
  CertificateStatusRepository,
} from "./manage-certificate-status";

const ACTOR = { id: "admin-1", login: "admin", name: "Админ" };
const AUDIT = { ipAddress: "127.0.0.1", userAgent: "test" };

function makeRepository(certificate: CertificateStatusRecord | null) {
  const state = {
    revoked: [] as { certificateId: string; revokedById: string; reason: string | null }[],
    restored: [] as string[],
    audits: [] as { action: string; objectId: string; ipAddress: string | null }[],
    current: certificate,
  };
  const repository: CertificateStatusRepository = {
    async transact(execute) {
      return execute({
        async find() {
          return state.current;
        },
        async revoke(input) {
          state.revoked.push(input);
          if (state.current) state.current = { ...state.current, status: "REVOKED" };
        },
        async restore(id) {
          state.restored.push(id);
          if (state.current) state.current = { ...state.current, status: "ISSUED" };
        },
        async recordAudit(audit) {
          state.audits.push({
            action: audit.action,
            objectId: audit.objectId,
            ipAddress: audit.ipAddress,
          });
        },
      });
    },
  };
  return { repository, state };
}

test("revoke: не найден → NOT_FOUND", async () => {
  const { repository, state } = makeRepository(null);
  const m = createManageCertificateStatus({ repository });
  await assert.rejects(
    m.revoke({ certificateId: "missing", reason: null, actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof CertificateStatusError && e.code === "NOT_FOUND",
  );
  assert.equal(state.revoked.length, 0);
});

test("revoke: ISSUED → REVOKED + аудит с ip", async () => {
  const { repository, state } = makeRepository({ id: "c-1", serial: "SER-1", status: "ISSUED" });
  const m = createManageCertificateStatus({ repository });
  await m.revoke({ certificateId: "c-1", reason: "дубликат", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.revoked, [{ certificateId: "c-1", revokedById: "admin-1", reason: "дубликат" }]);
  assert.equal(state.audits[0].action, "certificates:revoke");
  assert.equal(state.audits[0].ipAddress, "127.0.0.1");
});

test("revoke: уже REVOKED → идемпотентно (без мутации и аудита)", async () => {
  const { repository, state } = makeRepository({ id: "c-1", serial: "SER-1", status: "REVOKED" });
  const m = createManageCertificateStatus({ repository });
  await m.revoke({ certificateId: "c-1", reason: null, actor: ACTOR, audit: AUDIT });
  assert.equal(state.revoked.length, 0);
  assert.equal(state.audits.length, 0);
});

test("restore: REVOKED → ISSUED + аудит", async () => {
  const { repository, state } = makeRepository({ id: "c-1", serial: "SER-1", status: "REVOKED" });
  const m = createManageCertificateStatus({ repository });
  await m.restore({ certificateId: "c-1", actor: ACTOR, audit: AUDIT });
  assert.deepEqual(state.restored, ["c-1"]);
  assert.equal(state.audits[0].action, "certificates:restore");
});

test("restore: не REVOKED → идемпотентно", async () => {
  const { repository, state } = makeRepository({ id: "c-1", serial: "SER-1", status: "ISSUED" });
  const m = createManageCertificateStatus({ repository });
  await m.restore({ certificateId: "c-1", actor: ACTOR, audit: AUDIT });
  assert.equal(state.restored.length, 0);
  assert.equal(state.audits.length, 0);
});

test("restore: не найден → NOT_FOUND", async () => {
  const { repository } = makeRepository(null);
  const m = createManageCertificateStatus({ repository });
  await assert.rejects(
    m.restore({ certificateId: "missing", actor: ACTOR, audit: AUDIT }),
    (e) => e instanceof CertificateStatusError && e.code === "NOT_FOUND",
  );
});
