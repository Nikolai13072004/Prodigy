import assert from "node:assert/strict";
import { test } from "node:test";
import { EnrollmentApplicationError } from "./errors";
import {
  createUpdateCourseLearnersAccessBulk,
  extractBulkAccessSkipDetails,
} from "./update-course-learners-access-bulk";
import type {
  CourseHead,
  LearnerAccessEffects,
  LearnerAccessExpiries,
  LearnerAccessRepository,
  UpsertLearnerAssignmentInput,
} from "./learner-access-ports";

// Use-case массового изменения доступа: планировщик пропускает бессрочных
// и без назначений, применяет остальных, аудит один.

const COURSE: CourseHead = { id: "c1", title: "Курс", status: "PUBLISHED" };
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
  expiriesByLearner: Record<string, LearnerAccessExpiries>;
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
      return [];
    },
    async hasActiveAssignment() {
      return true;
    },
    async loadLearnerAccessExpiries(_courseId, learnerIds) {
      const map = new Map<string, LearnerAccessExpiries>();
      for (const id of learnerIds) {
        map.set(id, opts.expiriesByLearner[id] ?? { direct: [], group: [] });
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

test("трое учеников: с активным сроком, бессрочный и без назначений — счётчики верны, upsert только активному", async () => {
  const currentExpires = new Date("2026-06-01T00:00:00Z");
  const { repository, state } = makeRepository({
    course: COURSE,
    expiriesByLearner: {
      "u-active": { direct: [currentExpires], group: [] },
      "u-unlimited": { direct: [null], group: [] },
      "u-none": { direct: [], group: [] },
    },
  });
  const bulk = createUpdateCourseLearnersAccessBulk({ repository });

  const result = await bulk({
    courseId: "c1",
    learnerIds: ["u-active", "u-unlimited", "u-none"],
    mode: "EXTEND",
    requestedExpiresAt: null,
    days: 15,
    scope: "selected",
    now: NOW,
    audit: AUDIT,
  });

  assert.deepEqual(result.updatedLearnerIds, ["u-active"]);
  assert.equal(result.learnersWithUnlimitedAccess, 1);
  assert.equal(result.learnersWithoutAssignments, 1);
  assert.equal(state.upserts.length, 1);
  assert.deepEqual(
    state.upserts[0].inputs.map((i) => i.learnerId),
    ["u-active"],
  );
  assert.equal(state.effects[0].audit?.action, "courses:bulk_update_access");
});

test("ничего не применимо → NOTHING_TO_UPDATE со счётчиками через extractBulkAccessSkipDetails", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    expiriesByLearner: {
      "u-none-1": { direct: [], group: [] },
      "u-none-2": { direct: [], group: [] },
    },
  });
  const bulk = createUpdateCourseLearnersAccessBulk({ repository });

  await assert.rejects(
    bulk({
      courseId: "c1",
      learnerIds: ["u-none-1", "u-none-2"],
      mode: "EXTEND",
      requestedExpiresAt: null,
      days: 15,
      scope: "filtered",
      now: NOW,
      audit: AUDIT,
    }),
    (error) => {
      if (
        !(error instanceof EnrollmentApplicationError) ||
        error.code !== "NOTHING_TO_UPDATE"
      ) {
        return false;
      }
      const details = extractBulkAccessSkipDetails(error);
      return (
        details?.learnersWithoutAssignments === 2 &&
        details?.learnersWithUnlimitedAccess === 0
      );
    },
  );
  assert.equal(state.upserts.length, 0);
  assert.equal(state.effects.length, 0);
});

test("COURSE_NOT_FOUND если курса нет", async () => {
  const { repository } = makeRepository({
    course: null,
    expiriesByLearner: {},
  });
  const bulk = createUpdateCourseLearnersAccessBulk({ repository });

  await assert.rejects(
    bulk({
      courseId: "missing",
      learnerIds: ["u1"],
      mode: "SET_DATE",
      requestedExpiresAt: new Date("2027-01-01T00:00:00Z"),
      days: 0,
      scope: "selected",
      now: NOW,
      audit: AUDIT,
    }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "COURSE_NOT_FOUND",
  );
});

test("SET_DATE для нескольких активных: у всех новая дата", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    expiriesByLearner: {
      u1: { direct: [new Date("2026-06-01T00:00:00Z")], group: [] },
      u2: { direct: [new Date("2026-07-01T00:00:00Z")], group: [] },
    },
  });
  const bulk = createUpdateCourseLearnersAccessBulk({ repository });

  const target = new Date("2027-01-15T00:00:00Z");
  const result = await bulk({
    courseId: "c1",
    learnerIds: ["u1", "u2"],
    mode: "SET_DATE",
    requestedExpiresAt: target,
    days: 0,
    scope: "selected",
    now: NOW,
    audit: AUDIT,
  });

  assert.equal(result.updatedLearnerIds.length, 2);
  assert.equal(state.upserts[0].inputs.length, 2);
  for (const input of state.upserts[0].inputs) {
    assert.equal(input.expiresAt?.getTime(), target.getTime());
  }
});
