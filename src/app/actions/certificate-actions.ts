"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";
import { issueCertificateIfCompleted } from "@/modules/certification/server/issue-certificate-if-completed";
import { asOptionalString, asString } from "./course-action-input";

export async function revokeCertificate(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
  const certificateId = asString(formData, "certificateId");
  const reason = asOptionalString(formData, "reason");

  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: { id: true, serial: true, status: true },
  });
  if (!certificate) {
    redirect("/admin/certificates?error=notfound");
  }

  if (certificate.status !== "REVOKED") {
    await prisma.certificate.update({
      where: { id: certificate.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedById: session.user.id,
        revokeReason: reason,
      },
    });
    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "certificates:revoke",
      objectType: "certificate",
      objectId: certificate.id,
      objectLabel: certificate.serial,
      metadata: { reason },
    });
  }

  revalidatePath("/admin/certificates");
  redirect("/admin/certificates?revoked=1");
}

export async function restoreCertificate(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
  const certificateId = asString(formData, "certificateId");

  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: { id: true, serial: true, status: true },
  });
  if (!certificate) {
    redirect("/admin/certificates?error=notfound");
  }

  if (certificate.status === "REVOKED") {
    // Возвращаем тот же сертификат (серийник и снимок сохраняются) — отмена ошибочного отзыва.
    await prisma.certificate.update({
      where: { id: certificate.id },
      data: { status: "ISSUED", revokedAt: null, revokedById: null, revokeReason: null },
    });
    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "certificates:restore",
      objectType: "certificate",
      objectId: certificate.id,
      objectLabel: certificate.serial,
      metadata: {},
    });
  }

  revalidatePath("/admin/certificates");
  redirect("/admin/certificates?restored=1");
}

export async function issueCertificateManually(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
  const courseId = asString(formData, "courseId");
  const userId = asString(formData, "userId");

  if (!courseId || !userId) {
    redirect("/admin/certificates?error=missing");
  }

  const result = await issueCertificateIfCompleted({
    userId,
    courseId,
    issuedVia: "MANUAL",
    issuedById: session.user.id,
    bypassEligibility: true,
  });

  if (result.status === "ISSUED") {
    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "certificates:issue_manual",
      objectType: "certificate",
      objectId: result.certificate.id,
      objectLabel: result.certificate.serial,
      metadata: { courseId, userId },
    });
  }

  revalidatePath("/admin/certificates");
  redirect(`/admin/certificates?issued=${result.status}`);
}
