import "server-only";

import prisma from "@/lib/prisma";
import { parseCertificateSnapshot } from "@/modules/certification/domain/certificate-snapshot";

export type UserCertificateListItem = {
  serial: string;
  status: string;
  issuedAt: Date;
  courseTitle: string;
  scorePercent: number | null;
};

export async function selectUserCertificates(userId: string): Promise<UserCertificateListItem[]> {
  const records = await prisma.certificate.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    select: { serial: true, status: true, issuedAt: true, snapshotJson: true },
  });

  return records.map((record) => {
    let courseTitle = "Курс";
    let scorePercent: number | null = null;
    try {
      const snapshot = parseCertificateSnapshot(record.snapshotJson);
      courseTitle = snapshot.course.title;
      scorePercent = snapshot.completion.scorePercent;
    } catch {
      // Повреждённый снимок — показываем запись с заглушкой, не роняем список.
    }
    return {
      serial: record.serial,
      status: record.status,
      issuedAt: record.issuedAt,
      courseTitle,
      scorePercent,
    };
  });
}
