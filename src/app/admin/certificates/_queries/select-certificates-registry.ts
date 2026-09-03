import "server-only";

import prisma from "@/lib/prisma";

export type CertificateRegistryRow = {
  id: string;
  serial: string;
  status: string;
  issuedAt: Date;
  issuedVia: string;
  learnerName: string;
  learnerLogin: string;
  courseTitle: string;
};

export async function selectCertificatesRegistry(search: string): Promise<CertificateRegistryRow[]> {
  const query = search.trim();
  const where = query
    ? {
        OR: [
          { serial: { contains: query, mode: "insensitive" as const } },
          { user: { name: { contains: query, mode: "insensitive" as const } } },
          { user: { login: { contains: query, mode: "insensitive" as const } } },
          { course: { title: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const rows = await prisma.certificate.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    take: 200,
    select: {
      id: true,
      serial: true,
      status: true,
      issuedAt: true,
      issuedVia: true,
      user: { select: { name: true, login: true } },
      course: { select: { title: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    serial: row.serial,
    status: row.status,
    issuedAt: row.issuedAt,
    issuedVia: row.issuedVia,
    learnerName: row.user.name,
    learnerLogin: row.user.login,
    courseTitle: row.course.title,
  }));
}
