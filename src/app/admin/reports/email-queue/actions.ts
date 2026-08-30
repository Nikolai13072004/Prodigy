"use server";

import { revalidatePath } from "next/cache";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

async function getEmailJobForAction(jobId: string) {
  const job = await prisma.emailJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      toEmail: true,
      subject: true,
      status: true,
      template: true,
    },
  });

  if (!job) {
    throw new Error("Письмо не найдено.");
  }

  return job;
}

export async function retryEmailJob(jobId: string) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const job = await getEmailJobForAction(jobId);

  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "email_jobs:retry",
    objectType: "email_job",
    objectId: job.id,
    objectLabel: job.subject,
    metadata: {
      previousStatus: job.status,
      template: job.template,
      toEmail: job.toEmail,
    },
  });

  revalidatePath("/admin/reports/email-queue");
}

export async function cancelEmailJob(jobId: string) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const job = await getEmailJobForAction(jobId);

  if (job.status === "SENT") {
    throw new Error("Уже отправленное письмо нельзя отменить.");
  }

  await prisma.emailJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      nextAttemptAt: null,
      lastError: null,
    },
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "email_jobs:cancel",
    objectType: "email_job",
    objectId: job.id,
    objectLabel: job.subject,
    metadata: {
      previousStatus: job.status,
      template: job.template,
      toEmail: job.toEmail,
    },
  });

  revalidatePath("/admin/reports/email-queue");
}
