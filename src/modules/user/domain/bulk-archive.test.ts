import assert from "node:assert/strict";
import { test } from "node:test";
import { planBulkArchive } from "./bulk-archive";

test("архивирует всех, кроме текущего и уже архивированных", () => {
  const users = [
    { id: "me", status: "ACTIVE" },
    { id: "a", status: "ACTIVE" },
    { id: "b", status: "BLOCKED" },
    { id: "c", status: "ARCHIVED" },
  ];
  const plan = planBulkArchive(users, "me");
  assert.equal(plan.skippedCurrentUser, true);
  assert.deepEqual(plan.archiveUserIds, ["a", "b"]);
});

test("текущего нет в списке → skippedCurrentUser=false", () => {
  const plan = planBulkArchive([{ id: "a", status: "ACTIVE" }], "me");
  assert.equal(plan.skippedCurrentUser, false);
  assert.deepEqual(plan.archiveUserIds, ["a"]);
});

test("только текущий и архивные → архивировать некого", () => {
  const plan = planBulkArchive(
    [
      { id: "me", status: "ACTIVE" },
      { id: "c", status: "ARCHIVED" },
    ],
    "me",
  );
  assert.equal(plan.skippedCurrentUser, true);
  assert.deepEqual(plan.archiveUserIds, []);
});

test("пустой список → пусто и не пропущен", () => {
  const plan = planBulkArchive([], "me");
  assert.equal(plan.skippedCurrentUser, false);
  assert.deepEqual(plan.archiveUserIds, []);
});
