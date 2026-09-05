import "server-only";

import { Prisma } from "@prisma/client";
import type { OrgAudit } from "../application/ports";

// Общее для инфра-адаптеров Department/Organization: запись аудита в переданный
// транзакционный клиент и распознавание нарушения уникальности имени (P2002).

export async function recordOrgAudit(
  client: Prisma.TransactionClient,
  audit: OrgAudit,
): Promise<void> {
  await client.auditLogEvent.create({
    data: {
      actorId: audit.actorId,
      actorLogin: audit.actorLogin,
      actorName: audit.actorName,
      action: audit.action,
      objectType: audit.objectType,
      objectId: audit.objectId,
      objectLabel: audit.objectLabel,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      metadataJson:
        audit.metadata === undefined ? null : JSON.stringify(audit.metadata),
    },
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
