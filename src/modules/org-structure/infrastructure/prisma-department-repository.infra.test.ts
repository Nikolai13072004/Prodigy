import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { prismaDepartmentRepository as repo } from "./prisma-department-repository";

// Инфра-тест дженерик-репозитория оргструктуры (на примере Department).
// Запуск: npm run test:infra.

after(async () => {
  await prisma.$disconnect();
});

test("create + findById + аудит в одной транзакции", async () => {
  const rec = await repo.transact(async (tx) => {
    const created = await tx.create("os-dep-create");
    await tx.recordEffects({
      audit: {
        // actorId — FK на User (SetNull); в тесте пользователя не сидим, поэтому null.
        actorId: null,
        actorLogin: null,
        actorName: null,
        action: "departments:create",
        objectType: "department",
        objectId: created.id,
        objectLabel: created.name,
        ipAddress: null,
        userAgent: null,
      },
    });
    return created;
  });
  const found = await repo.findById(rec.id);
  assert.equal(found?.name, "os-dep-create");
  const audit = await prisma.auditLogEvent.findFirst({
    where: { objectId: rec.id, action: "departments:create" },
  });
  assert.ok(audit, "аудит записан в той же транзакции");
});

test("update меняет имя", async () => {
  const rec = await repo.transact((tx) => tx.create("os-dep-upd"));
  await repo.transact((tx) => tx.update(rec.id, "os-dep-upd-new"));
  const found = await repo.findById(rec.id);
  assert.equal(found?.name, "os-dep-upd-new");
});

test("remove удаляет запись", async () => {
  const rec = await repo.transact((tx) => tx.create("os-dep-del"));
  await repo.transact((tx) => tx.remove(rec.id));
  const found = await repo.findById(rec.id);
  assert.equal(found, null);
});

test("isUniqueViolation: дубликат name → P2002 → true", async () => {
  await repo.transact((tx) => tx.create("os-dep-dup"));
  let caught: unknown;
  try {
    await repo.transact((tx) => tx.create("os-dep-dup"));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(repo.isUniqueViolation(caught), true);
  assert.equal(repo.isUniqueViolation(new Error("прочее")), false);
});

test("transact атомарна: throw откатывает create", async () => {
  await assert.rejects(
    repo.transact(async (tx) => {
      await tx.create("os-dep-rollback");
      throw new Error("boom");
    }),
    /boom/,
  );
  const found = await prisma.department.findFirst({
    where: { name: "os-dep-rollback" },
  });
  assert.equal(found, null);
});
