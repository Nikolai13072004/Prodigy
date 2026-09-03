import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  CertificateStatusRepository,
  CertificateStatusTransaction,
} from "../application/manage-certificate-status";

function createTransaction(client: Prisma.TransactionClient): CertificateStatusTransaction {
  return {
    async find(certificateId) {
      const certificate = await client.certificate.findUnique({
        where: { id: certificateId },
        select: { id: true, serial: true, status: true },
      });
      return certificate ?? null;
    },
    async revoke({ certificateId, revokedById, reason }) {
      await client.certificate.update({
        where: { id: certificateId },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedById,
          revokeReason: reason,
        },
      });
    },
    async restore(certificateId) {
      await client.certificate.update({
        where: { id: certificateId },
        data: { status: "ISSUED", revokedAt: null, revokedById: null, revokeReason: null },
      });
    },
    async recordAudit(audit) {
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
          metadataJson: audit.metadata === undefined ? null : JSON.stringify(audit.metadata),
        },
      });
    },
  };
}

export const prismaCertificateStatusRepository: CertificateStatusRepository = {
  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
