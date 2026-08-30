import assert from "node:assert/strict";
import test from "node:test";
import type { EnrollmentAccessRepository } from "./ports";
import { createGetCourseEnrollmentAccess } from "./get-course-enrollment-access";

test("the use case loads assignments and returns the domain decision", async () => {
  const calls: Array<[string, string]> = [];
  const repository: EnrollmentAccessRepository = {
    async findAssignments(courseId, userId) {
      calls.push([courseId, userId]);
      return {
        directExpiries: [],
        groupExpiries: [new Date("2026-08-20T00:00:00Z")],
      };
    },
  };
  const getAccess = createGetCourseEnrollmentAccess(repository);
  const result = await getAccess({
    courseId: "course-1",
    userId: "user-1",
    now: new Date("2026-08-13T00:00:00Z"),
  });
  assert.deepEqual(calls, [["course-1", "user-1"]]);
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.source, "GROUP");
});
