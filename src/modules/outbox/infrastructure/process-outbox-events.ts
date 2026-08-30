import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  enqueueCertificateEmails,
  enqueueCourseAssignedEmails,
  enqueueCourseInviteEmails,
} from "@/lib/email/queue";
import { getPlatformSettings } from "@/lib/platform-settings";
import { createRouteOutboxEvent } from "../application/route-outbox-event";
import { OUTBOX_TOPICS } from "../domain/topics";

// Топики, чьи письма собираются из настроек платформы (шаблон, бренд).
const TOPICS_REQUIRING_SETTINGS = new Set<string>([
  OUTBOX_TOPICS.COURSE_ASSIGNED_EMAIL,
  OUTBOX_TOPICS.CERTIFICATE_ISSUED_EMAIL,
]);

const CLAIM_LEASE_MS = 5 * 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60_000;

function retryAt(attempts: number) {
  const delay = Math.min(RETRY_BASE_MS * Math.max(1, 2 ** (attempts - 1)), RETRY_MAX_MS);
  return new Date(Date.now() + delay);
}

function eventEligibility(now: Date, staleBefore: Date): Prisma.OutboxEventWhereInput {
  return {
    OR: [
      {
        status: { in: ["PENDING", "FAILED"] },
        availableAt: { lte: now },
      },
      {
        status: "PROCESSING",
        claimedAt: { lte: staleBefore },
      },
    ],
  };
}

async function claimOutboxEvents(limit: number) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  const candidates = await prisma.outboxEvent.findMany({
    where: eventEligibility(now, staleBefore),
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  const claimed = [];
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const result = await prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        ...eventEligibility(now, staleBefore),
      },
      data: {
        status: "PROCESSING",
        claimToken,
        claimedAt: now,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (result.count === 0) continue;
    const event = await prisma.outboxEvent.findUnique({ where: { id: candidate.id } });
    if (event?.claimToken === claimToken) claimed.push(event);
  }
  return claimed;
}

function parseOptionalDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid outbox date: ${value}`);
  return parsed;
}

async function processClaimedEvent(event: Awaited<ReturnType<typeof claimOutboxEvents>>[number]) {
  const settings = TOPICS_REQUIRING_SETTINGS.has(event.topic)
    ? await getPlatformSettings()
    : null;
  return prisma.$transaction(async (client) => {
    const owned = await client.outboxEvent.findFirst({
      where: { id: event.id, status: "PROCESSING", claimToken: event.claimToken },
      select: { id: true },
    });
    if (!owned) return false;

    const route = createRouteOutboxEvent({
      async courseAssignedEmail(payload) {
        await enqueueCourseAssignedEmails(
          payload.recipients,
          {
            courseTitle: payload.courseTitle,
            courseUrl: payload.courseUrl,
            accessExpiresAt: parseOptionalDate(payload.accessExpiresAt),
          },
          { client, settings: settings! },
        );
      },
      async courseInviteEmail(payload) {
        await enqueueCourseInviteEmails(
          payload.recipients,
          {
            courseTitle: payload.courseTitle,
            accessExpiresAt: parseOptionalDate(payload.accessExpiresAt),
            linkTtlHours: payload.linkTtlHours,
          },
          { client },
        );
      },
      async certificateIssuedEmail(payload) {
        await enqueueCertificateEmails(
          payload.recipients,
          {
            courseTitle: payload.courseTitle,
            courseUrl: payload.courseUrl,
            certificateUrl: payload.certificateUrl,
            certificateSerial: payload.certificateSerial,
            issuedAt: parseOptionalDate(payload.issuedAt),
          },
          { client, settings: settings! },
        );
      },
    });
    await route(event);
    const updated = await client.outboxEvent.updateMany({
      where: { id: event.id, status: "PROCESSING", claimToken: event.claimToken },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        availableAt: null,
        claimToken: null,
        claimedAt: null,
        lastError: null,
      },
    });
    return updated.count > 0;
  });
}

async function markEventFailed(
  event: Awaited<ReturnType<typeof claimOutboxEvents>>[number],
  error: unknown,
) {
  const permanentlyFailed = event.attempts >= event.maxAttempts;
  const message = error instanceof Error ? error.message : String(error);
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: "PROCESSING", claimToken: event.claimToken },
    data: {
      status: permanentlyFailed ? "DEAD" : "FAILED",
      availableAt: permanentlyFailed ? null : retryAt(event.attempts),
      claimToken: null,
      claimedAt: null,
      lastError: message.slice(0, 2000),
    },
  });
}

export async function processOutboxBatch(limit: number) {
  const events = await claimOutboxEvents(limit);
  let processed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      if (await processClaimedEvent(event)) processed += 1;
    } catch (error) {
      failed += 1;
      await markEventFailed(event, error);
    }
  }
  return { claimed: events.length, processed, failed };
}
