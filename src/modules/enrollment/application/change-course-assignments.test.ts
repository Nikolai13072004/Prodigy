import assert from "node:assert/strict";
import test from "node:test";
import { createChangeCourseAssignments } from "./change-course-assignments";
import { EnrollmentApplicationError } from "./errors";
import type {
  EnrollmentMutationRepository,
  EnrollmentMutationTransaction,
} from "./mutation-ports";

function createRepository(state: {
  courseStatus?: string;
  directUserIds?: string[];
  groupIds?: string[];
  inheritedUserIds?: string[];
} = {}) {
  const writes: Parameters<EnrollmentMutationTransaction["replaceState"]>[0][] = [];
  const effects: Parameters<EnrollmentMutationTransaction["recordEffects"]>[0][] = [];
  let transactionCount = 0;
  const transaction: EnrollmentMutationTransaction = {
    async loadState() {
      return {
        course: { title: "Course", status: state.courseStatus ?? "PUBLISHED" },
        directUserIds: state.directUserIds ?? [],
        groupIds: state.groupIds ?? [],
        inheritedUserIds: state.inheritedUserIds ?? [],
      };
    },
    async replaceState(args) {
      writes.push(args);
    },
    async findActiveRecipients() {
      return [
        { userId: "old-user", email: "old@example.com", name: null, firstName: null },
        { userId: "new-user", email: "new@example.com", name: "New", firstName: "N" },
      ];
    },
    async recordEffects(value) {
      effects.push(value);
    },
  };
  const repository: EnrollmentMutationRepository = {
    async transact(execute) {
      transactionCount += 1;
      return execute(transaction);
    },
  };
  return { repository, writes, effects, get transactionCount() { return transactionCount; } };
}

const effectContext = {
  actorLogin: "admin@example.com",
  actorName: "Admin",
  ipAddress: "127.0.0.1",
  userAgent: "test",
  courseUrl: "https://lms.example/courses/course-1",
  inviteRecipients: [{ email: "invite@example.com", inviteUrl: "https://lms.example/invite/token" }],
  inviteLinkTtlHours: 168,
  auditMetadata: { invalidEmails: [] },
};

test("state calculation and replacement happen in one repository transaction", async () => {
  const fixture = createRepository({ directUserIds: ["old-user"] });
  const change = createChangeCourseAssignments(fixture.repository);
  const result = await change({
    courseId: "course-1",
    actorId: "admin-1",
    mode: "ADD",
    requestedDirectUserIds: ["new-user"],
    requestedGroupIds: ["group-1"],
    accessExpiresAt: null,
    pendingInviteEmailsToReplace: ["invite@example.com"],
    pendingInvites: [{
      email: "invite@example.com",
      tokenHash: "hash",
      expiresAt: new Date("2026-08-20T00:00:00Z"),
      accessExpiresAt: null,
    }],
    effects: effectContext,
  });
  assert.equal(fixture.transactionCount, 1);
  assert.deepEqual(fixture.writes[0].directUserIds, ["old-user", "new-user"]);
  assert.deepEqual(fixture.writes[0].pendingInviteDelete, ["invite@example.com"]);
  assert.deepEqual(result.newlyAssignedRecipients.map((recipient) => recipient.userId), ["new-user"]);
  assert.equal(fixture.effects.length, 1);
  assert.equal(fixture.effects[0].outboxEvents.length, 2);
  assert.deepEqual(
    (fixture.effects[0].audit.metadata as { directUserIds: string[] }).directUserIds,
    ["old-user", "new-user"],
  );
});

test("REPLACE removes every pending invite before creating requested invites", async () => {
  const fixture = createRepository();
  const change = createChangeCourseAssignments(fixture.repository);
  await change({
    courseId: "course-1",
    actorId: "admin-1",
    mode: "REPLACE",
    requestedDirectUserIds: [],
    requestedGroupIds: [],
    accessExpiresAt: null,
    pendingInviteEmailsToReplace: [],
    pendingInvites: [],
    effects: { ...effectContext, inviteRecipients: [] },
  });
  assert.equal(fixture.writes[0].pendingInviteDelete, "ALL");
});

test("an unpublished course is rejected inside the transaction", async () => {
  const fixture = createRepository({ courseStatus: "DRAFT" });
  const change = createChangeCourseAssignments(fixture.repository);
  await assert.rejects(
    change({
      courseId: "course-1",
      actorId: "admin-1",
      mode: "CLEAR",
      requestedDirectUserIds: [],
      requestedGroupIds: [],
      accessExpiresAt: null,
      pendingInviteEmailsToReplace: [],
      pendingInvites: [],
      effects: { ...effectContext, inviteRecipients: [] },
    }),
    (error: unknown) => error instanceof EnrollmentApplicationError
      && error.code === "COURSE_NOT_PUBLISHED",
  );
  assert.equal(fixture.writes.length, 0);
});
