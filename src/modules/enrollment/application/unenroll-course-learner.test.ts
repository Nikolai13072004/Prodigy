import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnenrollCourseLearner } from "./unenroll-course-learner";
import type {
  UnenrollmentAudit,
  UnenrollmentLoadResult,
  UnenrollmentRepository,
  UnenrollmentWrite,
} from "./unenroll-ports";

// Оркестрация отчисления через фейковый репозиторий (без Prisma).

function context(overrides: Partial<UnenrollmentLoadResult> = {}): UnenrollmentLoadResult {
  return {
    courseTitle: "Курс",
    courseItemIds: ["i1"],
    courseQuizIds: ["q1"],
    hadDirectAssignment: true,
    hadGroupAssignment: false,
    ...overrides,
  };
}

function makeRepository(opts: { context?: UnenrollmentLoadResult | null; revokeResult?: boolean }) {
  const applied: UnenrollmentWrite[] = [];
  const audits: UnenrollmentAudit[] = [];
  let revokeCalls = 0;

  const repository: UnenrollmentRepository = {
    async loadContext() {
      return opts.context === undefined ? context() : opts.context;
    },
    async applyUnenrollment(write) {
      applied.push(write);
    },
    async revokeIssuedCertificate() {
      revokeCalls += 1;
      return opts.revokeResult ?? false;
    },
    async recordAudit(audit) {
      audits.push(audit);
    },
  };

  return { repository, applied, audits, revokeCalls: () => revokeCalls };
}

const COMMAND = {
  courseId: "c1",
  learnerId: "u1",
  actor: { id: "admin", login: "a@corp.ru", name: "Admin" },
  deleteProgress: false,
  revokeCertificate: false,
  now: new Date("2026-08-25T10:00:00Z"),
};

test("курс не найден → COURSE_NOT_FOUND, без записей", async () => {
  const repo = makeRepository({ context: null });
  const result = await createUnenrollCourseLearner(repo.repository)(COMMAND);
  assert.equal(result.status, "COURSE_NOT_FOUND");
  assert.equal(repo.applied.length, 0);
  assert.equal(repo.audits.length, 0);
});

test("нет назначения → NO_ASSIGNMENT, ничего не пишем", async () => {
  const repo = makeRepository({
    context: context({ hadDirectAssignment: false, hadGroupAssignment: false }),
  });
  const result = await createUnenrollCourseLearner(repo.repository)(COMMAND);
  assert.equal(result.status, "NO_ASSIGNMENT");
  assert.equal(repo.applied.length, 0);
  assert.equal(repo.audits.length, 0);
  assert.equal(repo.revokeCalls(), 0);
});

test("прямое назначение, без удаления прогресса и отзыва → DELETE_DIRECT, аудит без отзыва", async () => {
  const repo = makeRepository({ context: context() });
  const result = await createUnenrollCourseLearner(repo.repository)(COMMAND);

  assert.deepEqual(result, { status: "DONE", deletedProgress: false, certificateRevoked: false });
  assert.equal(repo.applied[0].assignmentAction, "DELETE_DIRECT");
  assert.equal(repo.applied[0].deleteProgress, false);
  assert.equal(repo.revokeCalls(), 0);
  assert.equal(repo.audits[0].certificateRevoked, false);
  assert.equal(repo.audits[0].overrideExpiresAt, null, "для прямого override не ставится");
});

test("групповое, удаление прогресса и отзыв → OVERRIDE_EXPIRE, отзыв, override-дата в аудите", async () => {
  const repo = makeRepository({
    context: context({ hadDirectAssignment: false, hadGroupAssignment: true }),
    revokeResult: true,
  });
  const result = await createUnenrollCourseLearner(repo.repository)({
    ...COMMAND,
    deleteProgress: true,
    revokeCertificate: true,
  });

  assert.deepEqual(result, { status: "DONE", deletedProgress: true, certificateRevoked: true });
  assert.equal(repo.applied[0].assignmentAction, "OVERRIDE_EXPIRE");
  assert.equal(repo.applied[0].deleteProgress, true);
  assert.equal(repo.revokeCalls(), 1);
  assert.equal(repo.audits[0].certificateRevoked, true);
  // override-дата — на секунду в прошлом от now
  assert.deepEqual(repo.audits[0].overrideExpiresAt, new Date("2026-08-25T09:59:59Z"));
});
