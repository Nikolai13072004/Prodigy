import {
  OUTBOX_TOPICS,
  type CertificateIssuedEmailEvent,
  type CourseAssignedEmailEvent,
  type CourseInviteEmailEvent,
} from "../domain/topics";

type OutboxRecord = { topic: string; payloadJson: string };

export type OutboxEventHandlers = {
  courseAssignedEmail(payload: CourseAssignedEmailEvent): Promise<void>;
  courseInviteEmail(payload: CourseInviteEmailEvent): Promise<void>;
  certificateIssuedEmail(payload: CertificateIssuedEmailEvent): Promise<void>;
};

function parsePayload(payloadJson: string) {
  const payload: unknown = JSON.parse(payloadJson);
  if (!payload || typeof payload !== "object") {
    throw new Error("Outbox payload must be an object");
  }
  return payload;
}

function hasRecipients(payload: object): payload is object & { recipients: unknown[] } {
  return "recipients" in payload && Array.isArray(payload.recipients);
}

export function createRouteOutboxEvent(handlers: OutboxEventHandlers) {
  return async function routeOutboxEvent(event: OutboxRecord) {
    const payload = parsePayload(event.payloadJson);
    if (!hasRecipients(payload)) {
      throw new Error("Outbox email event has no recipient list");
    }
    if (event.topic === OUTBOX_TOPICS.COURSE_ASSIGNED_EMAIL) {
      await handlers.courseAssignedEmail(payload as CourseAssignedEmailEvent);
      return;
    }
    if (event.topic === OUTBOX_TOPICS.COURSE_INVITE_EMAIL) {
      await handlers.courseInviteEmail(payload as CourseInviteEmailEvent);
      return;
    }
    if (event.topic === OUTBOX_TOPICS.CERTIFICATE_ISSUED_EMAIL) {
      await handlers.certificateIssuedEmail(payload as CertificateIssuedEmailEvent);
      return;
    }
    throw new Error(`Unsupported outbox topic: ${event.topic}`);
  };
}
