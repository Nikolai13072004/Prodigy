import prisma from "@/lib/prisma";
import { queueHrNotificationEmailsForSubscribedUsers } from "@/lib/hr-notifications";

const DEFAULT_POLL_MS = 60 * 60 * 1000;

function asInt(input: string | undefined, fallback: number) {
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function runOnce() {
  const result = await queueHrNotificationEmailsForSubscribedUsers();
  console.info(
    `[hr-notifications] queued=${result.queuedCount} recipients=${result.recipientCount}`
  );
}

async function runLoop() {
  const pollMs = asInt(process.env.HR_NOTIFICATION_POLL_MS, DEFAULT_POLL_MS);
  console.info(`[hr-notifications] loop started: poll=${pollMs}ms`);

  while (true) {
    await runOnce();
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
    console.error("[hr-notifications] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
