"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
  recordAuditEvent,
} from "@/lib/audit-log";
import { requirePermission } from "@/lib/auth-guards";
import { PERMISSIONS } from "@/lib/roles";
import { CertificateStatusError } from "@/modules/certification/application/manage-certificate-status";
import { issueCertificateIfCompleted } from "@/modules/certification/server/issue-certificate-if-completed";
import { certificateStatus } from "@/modules/certification/server/manage-certificate-status";
import { asOptionalString, asString } from "./course-action-input";

export async function revokeCertificate(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
  const certificateId = asString(formData, "certificateId");
  const reason = asOptionalString(formData, "reason") ?? null;

  try {
    await certificateStatus.revoke({
      certificateId,
      reason,
      actor: auditActorFromSessionUser(session.user),
      audit: await getAuditRequestContext(),
    });
  } catch (error) {
    if (error instanceof CertificateStatusError && error.code === "NOT_FOUND") {
      redirect("/admin/certificates?error=notfound");
    }
    throw error;
  }

  revalidatePath("/admin/certificates");
  redirect("/admin/certificates?revoked=1");
}

export async function restoreCertificate(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.CERTIFICATES_MANAGE);
  const certificateId = asString(formData, "certificateId");

  try {
    await certificateStatus.restore({
      certificateId,
      actor: auditActorFromSessionUser(session.user),
      audit: await getAuditRequestContext(),
    });
  } catch (error) {
    if (error instanceof CertificateStatusError && error.code === "NOT_FOUND") {
      redirect("/admin/certificates?error=notfound");
    }
    throw error;
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
