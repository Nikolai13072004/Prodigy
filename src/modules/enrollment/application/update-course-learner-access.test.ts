import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_STATUSES } from "@/lib/users";
import { EnrollmentApplicationError } from "./errors";
import { createUpdateCourseLearnerAccess } from "./update-course-learner-access";
import type {
  CourseHead,
  LearnerAccessEffects,
  LearnerAccessExpiries,
  LearnerAccessRepository,
  LearnerHead,
  UpsertLearnerAssignmentInput,
} from "./learner-access-ports";

// Use-case изменения окна доступа одного ученика: happy-path режимов
// EXTEND/SET_DATE/UNLIMITED, отсутствие назначений, уже бессрочный.

const COURSE: CourseHead = { id: "c1", title: "Курс", status: "PUBLISHED" };
const LEARNER: LearnerHead = {
  id: "u1",
  name: "Иван",
  email: "ivan@corp.ru",
  firstName: "Иван",
  status: USER_STATUSES.ACTIVE,
};
const AUDIT = {
  actorId: "admin-1",
  actorLogin: null,
  actorName: null,
  ipAddress: null,
  userAgent: null,
};
const NOW = new Date("2026-03-01T10:00:00Z");

function makeRepository(opts: {
  course?: CourseHead | null;
  learner?: LearnerHead | null;
  expiries?: LearnerAccessExpiries;
}) {
  const state = {
    upserts: [] as Array<{
      courseId: string;
      actorId: string;
      inputs: UpsertLearnerAssignmentInput[];
    }>,
    effects: [] as LearnerAccessEffects[],
  };

  const repository: LearnerAccessRepository = {
    async loadCourseHead() {
      return opts.course ?? null;
    },
    async loadLearners() {
      return opts.learner ? [opts.learner] : [];
    },
    async hasActiveAssignment() {
      return true;
    },
    async loadLearnerAccessExpiries(_courseId, learnerIds) {
      const map = new Map<string, LearnerAccessExpiries>();
      for (const id of learnerIds) {
        map.set(id, opts.expiries ?? { direct: [], group: [] });
      }
      return map;
    },
    async transact(execute) {
      return execute({
        async upsertLearnerAssignments(courseId, actorId, inputs) {
          state.upserts.push({ courseId, actorId, inputs: [...inputs] });
        },
        async recordEffects(effects) {
          state.effects.push(effects);
        },
      });
    },
  };

  return { repository, state };
}

test("EXTEND от активного срока: продлеваем на 30 дней", async () => {
  const currentExpires = new Date("2026-06-01T00:00:00Z");
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: LEARNER,
    expiries: { direct: [currentExpires], group: [] },
  });
  const update = createUpdateCourseLearnerAccess({ repository });

  const result = await update({
    courseId: "c1",
    learnerId: "u1",
    mode: "EXTEND",
    requestedExpiresAt: null,
    days: 30,
    now: NOW,
    accessEmailQueued: true,
    audit: AUDIT,
  });

  assert.ok(result.nextExpiresAt);
  const expected = currentExpires.getTime() + 30 * 24 * 60 * 60 * 1000;
  assert.equal(result.nextExpiresAt.getTime(), expected);
  assert.equal(state.upserts[0].inputs[0].expiresAt?.getTime(), expected);
  assert.equal(state.effects[0].audit?.action, "courses:update_access");
});

test("SET_DATE: применяется переданная дата, сообщение содержит новую дату", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: LEARNER,
    expiries: { direct: [new Date("2026-02-01T00:00:00Z")], group: [] },
  });
  const update = createUpdateCourseLearnerAccess({ repository });

  const target = new Date("2027-05-01T23:59:59Z");
  const result = await update({
    courseId: "c1",
    learnerId: "u1",
    mode: "SET_DATE",
    requestedExpiresAt: target,
    days: 0,
    now: NOW,
    accessEmailQueued: false,
    audit: AUDIT,
  });

  assert.equal(result.nextExpiresAt?.getTime(), target.getTime());
  assert.equal(state.upserts[0].inputs[0].expiresAt?.getTime(), target.getTime());
});

test("UNLIMITED: сохраняется null", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: LEARNER,
    expiries: { direct: [new Date("2026-06-01T00:00:00Z")], group: [] },
  });
  const update = createUpdateCourseLearnerAccess({ repository });

  const result = await update({
    courseId: "c1",
    learnerId: "u1",
    mode: "UNLIMITED",
    requestedExpiresAt: null,
    days: 0,
    now: NOW,
    accessEmailQueued: true,
    audit: AUDIT,
  });

  assert.equal(result.nextExpiresAt, null);
  assert.equal(state.upserts[0].inputs[0].expiresAt, null);
});

test("нет назначений → NO_ASSIGNMENT, никакого апсерта", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: LEARNER,
    expiries: { direct: [], group: [] },
  });
  const update = createUpdateCourseLearnerAccess({ repository });

  await assert.rejects(
    update({
      courseId: "c1",
      learnerId: "u1",
      mode: "EXTEND",
      requestedExpiresAt: null,
      days: 30,
      now: NOW,
      accessEmailQueued: false,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "NO_ASSIGNMENT",
  );
  assert.equal(state.upserts.length, 0);
});

test("уже бессрочный + UNLIMITED → ALREADY_UNLIMITED", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: LEARNER,
    expiries: { direct: [null], group: [] },
  });
  const update = createUpdateCourseLearnerAccess({ repository });

  await assert.rejects(
    update({
      courseId: "c1",
      learnerId: "u1",
      mode: "UNLIMITED",
      requestedExpiresAt: null,
      days: 0,
      now: NOW,
      accessEmailQueued: false,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "ALREADY_UNLIMITED",
  );
  assert.equal(state.upserts.length, 0);
});

test("COURSE_NOT_FOUND если курса нет", async () => {
  const { repository } = makeRepository({ course: null, learner: LEARNER });
  const update = createUpdateCourseLearnerAccess({ repository });

  await assert.rejects(
    update({
      courseId: "missing",
      learnerId: "u1",
      mode: "EXTEND",
      requestedExpiresAt: null,
      days: 30,
      now: NOW,
      accessEmailQueued: false,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "COURSE_NOT_FOUND",
  );
});
