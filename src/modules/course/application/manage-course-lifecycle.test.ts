import assert from "node:assert/strict";
import test from "node:test";
import { createManageCourseLifecycle } from "./manage-course-lifecycle";
import type {
  CourseLifecycleRepository,
  CourseLifecycleTransaction,
  CourseLifecycleSnapshot,
} from "./lifecycle-ports";

const actor = { id: "admin", login: null, name: "Admin", ipAddress: null, userAgent: null };
const snapshot: CourseLifecycleSnapshot = {
  id: "course",
  title: "Course",
  description: "Description",
  status: "DRAFT",
  moduleCount: 1,
  affectedAudienceCount: 0,
  publishedSnapshotJson: '{"version":1}',
  items: [{
    type: "TEXT",
    title: "Lesson",
    moduleId: "module",
    contentIsMeaningful: true,
    fileUrl: null,
    totalSlides: null,
    quizQuestionCount: 0,
    surveyQuestionCount: 0,
  }],
};

test("publishing persists status, snapshot, timestamp, and audit in one transaction", async () => {
  const calls: string[] = [];
  let savedSnapshot: string | undefined;
  const service = createManageCourseLifecycle(repositoryWith({
    load: async () => snapshot,
    changeStatus: async (args) => { calls.push("status"); savedSnapshot = args.publishedSnapshotJson; },
    recordAudit: async () => { calls.push("audit"); },
  }));

  const result = await service.changeStatus({
    courseId: "course",
    nextStatus: "PUBLISHED",
    confirmedAssignedImpact: false,
    actor,
    now: new Date("2026-08-14T00:00:00.000Z"),
  });
  assert.equal(result.status, "PUBLISHED");
  assert.equal(savedSnapshot, snapshot.publishedSnapshotJson);
  assert.deepEqual(calls, ["status", "audit"]);
});

test("deletion uses the lightweight identity read and records audit transactionally", async () => {
  const calls: string[] = [];
  const service = createManageCourseLifecycle(repositoryWith({
    load: async () => { throw new Error("full read must not run"); },
    loadIdentity: async () => ({ id: "course", title: "Course", status: "DRAFT" }),
    delete: async () => { calls.push("delete"); },
    recordAudit: async () => { calls.push("audit"); },
  }));
  await service.delete({ courseId: "course", actor });
  assert.deepEqual(calls, ["delete", "audit"]);
});

function repositoryWith(overrides: Partial<CourseLifecycleTransaction>): CourseLifecycleRepository {
  const defaults: CourseLifecycleTransaction = {
    load: async () => null,
    loadIdentity: async () => null,
    changeStatus: async () => undefined,
    delete: async () => undefined,
    recordAudit: async () => undefined,
  };
  return { transact: (execute) => execute({ ...defaults, ...overrides }) };
}
