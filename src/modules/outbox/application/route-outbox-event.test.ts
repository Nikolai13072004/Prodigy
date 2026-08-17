import assert from "node:assert/strict";
import test from "node:test";
import { OUTBOX_TOPICS } from "../domain/topics";
import { createRouteOutboxEvent } from "./route-outbox-event";

test("routes a course assignment event to its handler", async () => {
  const calls: string[] = [];
  const route = createRouteOutboxEvent({
    async courseAssignedEmail(payload) {
      calls.push(payload.courseTitle);
    },
    async courseInviteEmail() {
      throw new Error("unexpected handler");
    },
  });
  await route({
    topic: OUTBOX_TOPICS.COURSE_ASSIGNED_EMAIL,
    payloadJson: JSON.stringify({
      recipients: [{ email: "student@example.com", name: null, firstName: null }],
      courseTitle: "Architecture",
      courseUrl: "https://lms.example/courses/1",
      accessExpiresAt: null,
    }),
  });
  assert.deepEqual(calls, ["Architecture"]);
});

test("rejects an unknown topic so the worker can retry or dead-letter it", async () => {
  const route = createRouteOutboxEvent({
    async courseAssignedEmail() {},
    async courseInviteEmail() {},
  });
  await assert.rejects(
    route({ topic: "unknown", payloadJson: JSON.stringify({ recipients: [] }) }),
    /Unsupported outbox topic/,
  );
});

test("rejects malformed email payloads", async () => {
  const route = createRouteOutboxEvent({
    async courseAssignedEmail() {},
    async courseInviteEmail() {},
  });
  await assert.rejects(
    route({ topic: OUTBOX_TOPICS.COURSE_INVITE_EMAIL, payloadJson: "{}" }),
    /recipient list/,
  );
});
