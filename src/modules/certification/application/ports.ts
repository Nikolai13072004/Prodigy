import type { CertificateCourseItem } from "../domain/certificate-snapshot";

// Порты слоя application для модуля certification (ADR-012). Инфраструктура
// реализует их через Prisma; use-case и тесты зависят только от этих интерфейсов.

export type CertificateRecord = {
  id: string;
  serial: string;
  courseId: string;
  userId: string;
  status: string;
  issuedAt: Date;
  snapshotJson: string;
};

// Контекст завершения — по ЖИВЫМ данным курса (не publishedSnapshotJson).
export type CompletionContext = {
  isAssignedLearner: boolean;
  completedAt: Date;
  learner: {
    name: string;
    firstName: string;
    lastName: string | null;
    login: string;
    email: string | null;
  };
  course: {
    id: string;
    title: string;
    durationMinutes: number | null;
    category: string | null;
    statusFormat: string;
    ownerId: string | null;
  };
  items: CertificateCourseItem[];
  platform: { siteName: string; logoUrl: string | null };
};

export type NewCertificate = {
  serial: string;
  courseId: string;
  userId: string;
  issuedVia: string;
  issuedById: string | null;
  completedAt: Date;
  snapshotJson: string;
};

export type CertificationAudit = {
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  objectLabel: string;
  metadata: unknown;
};

export type CertificationEffects = {
  outboxEvents: Array<{ topic: string; payload: unknown }>;
  audit?: CertificationAudit;
};

export interface CertificationTransaction {
  findCertificate(): Promise<CertificateRecord | null>;
  loadCompletionContext(): Promise<CompletionContext | null>;
  createCertificate(data: NewCertificate): Promise<CertificateRecord>;
  recordEffects(effects: CertificationEffects): Promise<void>;
}

export interface CertificationRepository {
  transact<T>(args: {
    courseId: string;
    userId: string;
    execute: (transaction: CertificationTransaction) => Promise<T>;
  }): Promise<T>;
  // Отдельно от transact: use-case не импортирует Prisma, поэтому распознавание
  // гонки по уникальному индексу (@@unique([courseId, userId]) → P2002) инжектируется.
  isUniqueViolation(error: unknown): boolean;
}
