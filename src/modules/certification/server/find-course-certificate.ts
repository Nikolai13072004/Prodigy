import "server-only";

import prisma from "@/lib/prisma";

// Сертификат ученика по конкретному курсу (для ссылок «Открыть сертификат» в UI).
// @@unique([courseId, userId]) гарантирует не больше одной записи.
export async function findCourseCertificate(userId: string, courseId: string) {
  return prisma.certificate.findFirst({
    where: { userId, courseId },
    select: { serial: true, status: true },
  });
}
