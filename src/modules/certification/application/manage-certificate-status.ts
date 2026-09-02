// Управление статусом выданного сертификата: отзыв и восстановление.
// Мутация и аудит пишутся в одной транзакции (ADR-005). Guard прав и
// revalidate/redirect остаются на транспорте.

export type CertificateStatusRecord = {
  id: string;
  serial: string;
  status: string;
};

export type CertificateStatusActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type CertificateStatusAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type CertificateStatusAudit = {
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  objectLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
};

export interface CertificateStatusTransaction {
  find(certificateId: string): Promise<CertificateStatusRecord | null>;
  revoke(input: { certificateId: string; revokedById: string; reason: string | null }): Promise<void>;
  restore(certificateId: string): Promise<void>;
  recordAudit(audit: CertificateStatusAudit): Promise<void>;
}

export interface CertificateStatusRepository {
  transact<T>(execute: (transaction: CertificateStatusTransaction) => Promise<T>): Promise<T>;
}

export class CertificateStatusError extends Error {
  constructor(readonly code: "NOT_FOUND", message: string) {
    super(message);
    this.name = "CertificateStatusError";
  }
}

export type RevokeCertificateCommand = {
  certificateId: string;
  reason: string | null;
  actor: CertificateStatusActor;
  audit: CertificateStatusAuditContext;
};

export type RestoreCertificateCommand = {
  certificateId: string;
  actor: CertificateStatusActor;
  audit: CertificateStatusAuditContext;
};

export function createManageCertificateStatus(deps: { repository: CertificateStatusRepository }) {
  const { repository } = deps;

  return {
    async revoke(command: RevokeCertificateCommand): Promise<void> {
      await repository.transact(async (tx) => {
        const certificate = await tx.find(command.certificateId);
        if (!certificate) {
          throw new CertificateStatusError("NOT_FOUND", "Сертификат не найден.");
        }
        if (certificate.status === "REVOKED") return;

        await tx.revoke({
          certificateId: certificate.id,
          revokedById: command.actor.id,
          reason: command.reason,
        });
        await tx.recordAudit({
          actorId: command.actor.id,
          actorLogin: command.actor.login,
          actorName: command.actor.name,
          action: "certificates:revoke",
          objectType: "certificate",
          objectId: certificate.id,
          objectLabel: certificate.serial,
          ipAddress: command.audit.ipAddress,
          userAgent: command.audit.userAgent,
          metadata: { reason: command.reason },
        });
      });
    },

    async restore(command: RestoreCertificateCommand): Promise<void> {
      await repository.transact(async (tx) => {
        const certificate = await tx.find(command.certificateId);
        if (!certificate) {
          throw new CertificateStatusError("NOT_FOUND", "Сертификат не найден.");
        }
        if (certificate.status !== "REVOKED") return;

        await tx.restore(certificate.id);
        await tx.recordAudit({
          actorId: command.actor.id,
          actorLogin: command.actor.login,
          actorName: command.actor.name,
          action: "certificates:restore",
          objectType: "certificate",
          objectId: certificate.id,
          objectLabel: certificate.serial,
          ipAddress: command.audit.ipAddress,
          userAgent: command.audit.userAgent,
          metadata: {},
        });
      });
    },
  };
}
