import assert from "node:assert/strict";
import test from "node:test";
import { planCourseAssignments } from "./assignment-plan";

test("ADD preserves current assignments and appends unique requested values", () => {
  assert.deepEqual(planCourseAssignments({
    mode: "ADD",
    currentDirectUserIds: ["user-1"],
    currentGroupIds: ["group-1"],
    requestedDirectUserIds: ["user-1", "user-2", "user-2"],
    requestedGroupIds: ["group-2"],
  }), {
    directUserIds: ["user-1", "user-2"],
    groupIds: ["group-1", "group-2"],
  });
});

test("REPLACE ignores the current state", () => {
  assert.deepEqual(planCourseAssignments({
    mode: "REPLACE",
    currentDirectUserIds: ["old-user"],
    currentGroupIds: ["old-group"],
    requestedDirectUserIds: ["new-user"],
    requestedGroupIds: ["new-group"],
  }), {
    directUserIds: ["new-user"],
    groupIds: ["new-group"],
  });
});

test("CLEAR removes direct and group assignments", () => {
  assert.deepEqual(planCourseAssignments({
    mode: "CLEAR",
    currentDirectUserIds: ["user-1"],
    currentGroupIds: ["group-1"],
    requestedDirectUserIds: ["ignored-user"],
    requestedGroupIds: ["ignored-group"],
  }), { directUserIds: [], groupIds: [] });
});
