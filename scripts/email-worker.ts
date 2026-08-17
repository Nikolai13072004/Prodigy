import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/provider";
import { claimEmailJob, markEmailJobFailed, markEmailJobSent, pickEmailJobs } from "@/lib/email/queue";
import { processOutboxBatch } from "@/modules/outbox/infrastructure/process-outbox-events";

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_POLL_MS = 15_000;

function asInt(input: string | undefined, fallback: number) {
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function processBatch(limit: number) {
  const outbox = await processOutboxBatch(limit);
  const jobs = await pickEmailJobs(limit);
  if (jobs.length === 0) return { emailJobs: 0, outbox };

  for (const job of jobs) {
    if (job.attempts >= job.maxAttempts) continue;

    const claimed = await claimEmailJob(job.id);
    if (!claimed) continue;

    const nextAttempts = job.attempts + 1;
    try {
      await sendEmail({
        toEmail: job.toEmail,
        toName: job.toName,
        subject: job.subject,
        htmlBody: job.htmlBody,
        textBody: job.textBody,
      });
      await markEmailJobSent(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markEmailJobFailed(job.id, nextAttempts, message, job.maxAttempts);
    }
  }

  return { emailJobs: jobs.length, outbox };
}

async function runOnce() {
  const limit = asInt(process.env.EMAIL_WORKER_BATCH, DEFAULT_BATCH_SIZE);
  const processed = await processBatch(limit);
  console.info(
    `[email-worker] email-jobs=${processed.emailJobs} outbox-claimed=${processed.outbox.claimed} outbox-processed=${processed.outbox.processed} outbox-failed=${processed.outbox.failed}`,
  );
}

async function runLoop() {
  const limit = asInt(process.env.EMAIL_WORKER_BATCH, DEFAULT_BATCH_SIZE);
  const pollMs = asInt(process.env.EMAIL_WORKER_POLL_MS, DEFAULT_POLL_MS);
  console.info(`[email-worker] loop started: batch=${limit}, poll=${pollMs}ms`);

  while (true) {
    await processBatch(limit);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function main() {
  const mode = (process.argv[2] ?? "once").toLowerCase();
  if (mode === "loop") {
    await runLoop();
    return;
  }
  await runOnce();
}

main()
  .catch((error) => {
    console.error("[email-worker] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
