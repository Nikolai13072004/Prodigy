import "server-only";

import prisma from "@/lib/prisma";
import {
  parseCertificateSnapshot,
  type CertificateSnapshot,
} from "@/modules/certification/domain/certificate-snapshot";

export type CertificateView = {
  serial: string;
  status: string;
  issuedAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  ownerUserId: string;
  courseId: string;
  // ownerId курса — ТОЛЬКО для проверки доступа, не для рендера (ADR-012).
  courseOwnerId: string | null;
  snapshot: CertificateSnapshot;
};

export async function selectCertificateBySerial(serial: string): Promise<CertificateView | null> {
  const record = await prisma.certificate.findUnique({
    where: { serial },
    select: {
      serial: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      revokeReason: true,
      userId: true,
      courseId: true,
      snapshotJson: true,
      course: { select: { ownerId: true } },
    },
  });
  if (!record) return null;

  let snapshot: CertificateSnapshot;
  try {
    snapshot = parseCertificateSnapshot(record.snapshotJson);
  } catch {
    // Повреждённый или несовместимый снимок — трактуем как отсутствующий сертификат.
    return null;
  }

  return {
    serial: record.serial,
    status: record.status,
    issuedAt: record.issuedAt,
    revokedAt: record.revokedAt,
    revokeReason: record.revokeReason,
    ownerUserId: record.userId,
    courseId: record.courseId,
    courseOwnerId: record.course?.ownerId ?? null,
    snapshot,
  };
}
