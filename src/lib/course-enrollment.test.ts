import assert from "node:assert/strict";
import { test } from "node:test";
import { getUniqueEnrolledLearnersCount } from "./course-enrollment";

// Уникальные записанные на курс: прямые и групповые назначения без дублей,
// с учётом срока. «Активность» определяется по expiresAt относительно now.

const PAST = new Date(2000, 0, 1); // истёкшее
// активное назначение — expiresAt не задан (бессрочно)

test("прямые активные учитываются, дубли между группами не считаются дважды", () => {
  const count = getUniqueEnrolledLearnersCount({
    directAssignments: [{ userId: "a" }],
    groupAssignments: [
      { group: { memberships: [{ userId: "a" }, { userId: "b" }] } },
      { group: { memberships: [{ userId: "b" }, { userId: "c" }] } },
    ],
  });
  assert.equal(count, 3, "a, b, c — каждый один раз");
});

test("истёкшее групповое назначение не даёт записей", () => {
  const count = getUniqueEnrolledLearnersCount({
    directAssignments: [],
    groupAssignments: [{ expiresAt: PAST, group: { memberships: [{ userId: "d" }] } }],
  });
  assert.equal(count, 0);
});

test("истёкшее прямое назначение исключает пользователя даже из активной группы", () => {
  const count = getUniqueEnrolledLearnersCount({
    directAssignments: [
      { userId: "a" }, // активен
      { userId: "b", expiresAt: PAST }, // истёк
    ],
    groupAssignments: [{ group: { memberships: [{ userId: "a" }, { userId: "b" }, { userId: "c" }] } }],
  });
  // a (актив), c (через группу); b исключён — истёкшее прямое назначение подавляет групповое
  assert.equal(count, 2);
});

test("нет назначений → ноль", () => {
  assert.equal(getUniqueEnrolledLearnersCount({ directAssignments: [], groupAssignments: [] }), 0);
});
