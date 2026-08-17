import prisma from "@/lib/prisma";
import { queueDueHrReportScheduleEmails } from "@/lib/hr-report-schedules";

const DEFAULT_POLL_MS = 60_000;

function asInt(input: string | undefined, fallback: number) {
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function runOnce() {
  const result = await queueDueHrReportScheduleEmails();
  console.info(
    `[hr-report-schedules] queued_schedules=${result.queuedSchedules} queued_emails=${result.queuedEmails}`
  );
}

async function runLoop() {
  const pollMs = asInt(process.env.HR_REPORT_SCHEDULE_POLL_MS, DEFAULT_POLL_MS);
  console.info(`[hr-report-schedules] loop started: poll=${pollMs}ms`);

  while (true) {
    await queueDueHrReportScheduleEmails();
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
    console.error("[hr-report-schedules] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
