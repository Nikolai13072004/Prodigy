// Порты блокировки ученика HR-ом (blockLearnerAsHr).
// Мутация (блок + отмена PENDING-активаций) и аудит — в одной транзакции.

export type LearnerToBlock = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  status: string;
  role: string;
  roleProfileNames: string[];
};

export type BlockLearnerAudit = {
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

export interface BlockLearnerTransaction {
  blockUser(userId: string): Promise<void>;
  cancelPendingActivationInvites(userId: string): Promise<void>;
  recordAudit(audit: BlockLearnerAudit): Promise<void>;
}

export interface BlockLearnerRepository {
  findLearner(learnerId: string): Promise<LearnerToBlock | null>;
  // Курсы, где ученик числится (прямые назначения + через группы) — для ревалидации.
  findRelatedCourseIds(learnerId: string): Promise<string[]>;
  transact<T>(execute: (transaction: BlockLearnerTransaction) => Promise<T>): Promise<T>;
}
