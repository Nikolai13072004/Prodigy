import assert from "node:assert/strict";
import { test } from "node:test";
import { getAttemptOutcomeMeta } from "./attempt-outcome";

// Приоритет статусов попытки: PASSED важнее «в работе», «в работе» важнее ручной
// проверки, исчерпание попыток превращает провал в окончательный FAILED.

test("PASSED побеждает любые незавершённые сигналы", () => {
  assert.deepEqual(getAttemptOutcomeMeta({ bestOutcome: "PASSED", attemptsUsed: 1, maxAttempts: 3 }), {
    code: "PASSED",
    label: "Пройден",
  });
  assert.equal(
    getAttemptOutcomeMeta({ bestOutcome: "PASSED", attemptsUsed: 2, maxAttempts: 3, hasInProgress: true }).code,
    "PASSED",
  );
});

test("активная попытка (hasInProgress) важнее ручной проверки", () => {
  assert.equal(
    getAttemptOutcomeMeta({ bestOutcome: null, attemptsUsed: 0, maxAttempts: 3, hasInProgress: true }).code,
    "IN_PROGRESS",
  );
  assert.equal(
    getAttemptOutcomeMeta({
      bestOutcome: "PENDING_REVIEW",
      attemptsUsed: 1,
      maxAttempts: 3,
      hasInProgress: true,
    }).code,
    "IN_PROGRESS",
  );
});

test("ожидание ручной проверки — по флагу или лучшему исходу", () => {
  assert.deepEqual(getAttemptOutcomeMeta({ bestOutcome: "PENDING_REVIEW", attemptsUsed: 1, maxAttempts: 3 }), {
    code: "PENDING_REVIEW",
    label: "На проверке",
  });
  assert.equal(
    getAttemptOutcomeMeta({ bestOutcome: null, attemptsUsed: 0, maxAttempts: 3, hasPendingReview: true }).code,
    "PENDING_REVIEW",
  );
});

test("нет ни одной завершённой попытки → NOT_STARTED", () => {
  assert.deepEqual(getAttemptOutcomeMeta({ bestOutcome: null, attemptsUsed: 0, maxAttempts: 3 }), {
    code: "NOT_STARTED",
    label: "Не начат",
  });
});

test("FAILED/ATTEMPTED: исчерпание попыток → FAILED, иначе ещё в работе", () => {
  assert.equal(getAttemptOutcomeMeta({ bestOutcome: "FAILED", attemptsUsed: 3, maxAttempts: 3 }).code, "FAILED");
  assert.equal(getAttemptOutcomeMeta({ bestOutcome: "FAILED", attemptsUsed: 1, maxAttempts: 3 }).code, "IN_PROGRESS");
  assert.equal(getAttemptOutcomeMeta({ bestOutcome: "ATTEMPTED", attemptsUsed: 2, maxAttempts: 2 }).code, "FAILED");
});

test("неизвестный исход трактуется по остатку попыток", () => {
  assert.equal(getAttemptOutcomeMeta({ bestOutcome: "WEIRD", attemptsUsed: 3, maxAttempts: 3 }).code, "FAILED");
  assert.equal(getAttemptOutcomeMeta({ bestOutcome: "WEIRD", attemptsUsed: 1, maxAttempts: 3 }).code, "IN_PROGRESS");
});
