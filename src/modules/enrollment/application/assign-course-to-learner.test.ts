import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_STATUSES } from "@/lib/users";
import { EnrollmentApplicationError } from "./errors";
import { createAssignCourseToLearner } from "./assign-course-to-learner";
import type {
  CourseHead,
  LearnerAccessEffects,
  LearnerAccessRepository,
  LearnerHead,
  UpsertLearnerAssignmentInput,
} from "./learner-access-ports";

// Use-case точечного назначения курса ученику: проверяем сценарии
// «уже назначен», «архивный», «неопубликованный курс» и happy-path с аудитом.

function makeRepository(opts: {
  course?: CourseHead | null;
  learner?: LearnerHead | null;
  active?: boolean;
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
      return opts.active ?? false;
    },
    async loadLearnerAccessExpiries() {
      return new Map();
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

test("happy-path: upsert + аудит courses:assign", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: LEARNER,
  });
  const assign = createAssignCourseToLearner({ repository });

  const result = await assign({
    courseId: "c1",
    learnerId: "u1",
    accessExpiresAt: new Date("2027-01-01T00:00:00Z"),
    audit: AUDIT,
  });

  assert.equal(result.course.id, "c1");
  assert.equal(state.upserts.length, 1);
  assert.deepEqual(state.upserts[0].inputs, [
    { learnerId: "u1", expiresAt: new Date("2027-01-01T00:00:00Z") },
  ]);
  assert.equal(state.effects[0].audit?.action, "courses:assign");
});

test("USER_NOT_FOUND: репозиторий вернул пустой массив", async () => {
  const { repository, state } = makeRepository({ course: COURSE, learner: null });
  const assign = createAssignCourseToLearner({ repository });

  await assert.rejects(
    assign({ courseId: "c1", learnerId: "u1", accessExpiresAt: null, audit: AUDIT }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "USER_NOT_FOUND",
  );
  assert.equal(state.upserts.length, 0);
});

test("USER_ARCHIVED: архивному нельзя", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: { ...LEARNER, status: USER_STATUSES.ARCHIVED },
  });
  const assign = createAssignCourseToLearner({ repository });

  await assert.rejects(
    assign({ courseId: "c1", learnerId: "u1", accessExpiresAt: null, audit: AUDIT }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "USER_ARCHIVED",
  );
  assert.equal(state.upserts.length, 0);
});

test("COURSE_NOT_PUBLISHED: черновик не назначим", async () => {
  const { repository, state } = makeRepository({
    course: { ...COURSE, status: "DRAFT" },
    learner: LEARNER,
  });
  const assign = createAssignCourseToLearner({ repository });

  await assert.rejects(
    assign({ courseId: "c1", learnerId: "u1", accessExpiresAt: null, audit: AUDIT }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "COURSE_NOT_PUBLISHED",
  );
  assert.equal(state.upserts.length, 0);
});

test("ALREADY_ASSIGNED: активное назначение уже есть", async () => {
  const { repository, state } = makeRepository({
    course: COURSE,
    learner: LEARNER,
    active: true,
  });
  const assign = createAssignCourseToLearner({ repository });

  await assert.rejects(
    assign({ courseId: "c1", learnerId: "u1", accessExpiresAt: null, audit: AUDIT }),
    (error) =>
      error instanceof EnrollmentApplicationError &&
      error.code === "ALREADY_ASSIGNED",
  );
  assert.equal(state.upserts.length, 0);
});
