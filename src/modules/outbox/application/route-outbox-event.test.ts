import assert from "node:assert/strict";
import test from "node:test";
import { OUTBOX_TOPICS } from "../domain/topics";
import { createRouteOutboxEvent, type OutboxEventHandlers } from "./route-outbox-event";

// Заглушки-обработчики: по умолчанию каждый бросает, тест переопределяет нужный.
function stubHandlers(overrides: Partial<OutboxEventHandlers> = {}): OutboxEventHandlers {
  return {
    async courseAssignedEmail() { throw new Error("unexpected courseAssignedEmail"); },
    async courseInviteEmail() { throw new Error("unexpected courseInviteEmail"); },
    async certificateIssuedEmail() { throw new Error("unexpected certificateIssuedEmail"); },
    ...overrides,
  };
}

test("routes a course assignment event to its handler", async () => {
  const calls: string[] = [];
  const route = createRouteOutboxEvent(
    stubHandlers({
      async courseAssignedEmail(payload) {
        calls.push(payload.courseTitle);
      },
    }),
  );
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

test("routes a certificate issued event to its handler", async () => {
  const calls: string[] = [];
  const route = createRouteOutboxEvent(
    stubHandlers({
      async certificateIssuedEmail(payload) {
        calls.push(payload.certificateSerial);
      },
    }),
  );
  await route({
    topic: OUTBOX_TOPICS.CERTIFICATE_ISSUED_EMAIL,
    payloadJson: JSON.stringify({
      recipients: [{ email: "student@example.com", name: null, firstName: null }],
      courseTitle: "Финансы",
      courseUrl: "https://lms.example/courses/1",
      certificateUrl: "https://lms.example/certificates/abc",
      certificateSerial: "abc",
      issuedAt: "2026-08-25T10:00:00.000Z",
    }),
  });
  assert.deepEqual(calls, ["abc"]);
});

test("rejects an unknown topic so the worker can retry or dead-letter it", async () => {
  const route = createRouteOutboxEvent(stubHandlers());
  await assert.rejects(
    route({ topic: "unknown", payloadJson: JSON.stringify({ recipients: [] }) }),
    /Unsupported outbox topic/,
  );
});

test("rejects malformed email payloads", async () => {
  const route = createRouteOutboxEvent(stubHandlers());
  await assert.rejects(
    route({ topic: OUTBOX_TOPICS.COURSE_INVITE_EMAIL, payloadJson: "{}" }),
    /recipient list/,
  );
});

test("rejects a certificate event without recipients", async () => {
  const route = createRouteOutboxEvent(stubHandlers());
  await assert.rejects(
    route({
      topic: OUTBOX_TOPICS.CERTIFICATE_ISSUED_EMAIL,
      payloadJson: JSON.stringify({ certificateSerial: "abc" }),
    }),
    /recipient list/,
  );
});
