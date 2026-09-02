// Порт для простых справочных сущностей оргструктуры (Department / Organization):
// обе — {id, name} с уникальным именем и одинаковым CRUD. Один порт, два тонких
// инфра-адаптера. Аудит пишется в одной транзакции с мутацией (ADR-005).

export type OrgAudit = {
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  objectLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata?: unknown;
};

export type OrgEntityRecord = {
  id: string;
  name: string;
};

export type OrgEntityEffects = {
  audit: OrgAudit;
};

export interface OrgEntityTransaction {
  create(name: string): Promise<OrgEntityRecord>;
  update(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  recordEffects(effects: OrgEntityEffects): Promise<void>;
}

export interface OrgEntityRepository {
  findById(id: string): Promise<OrgEntityRecord | null>;
  transact<T>(
    execute: (transaction: OrgEntityTransaction) => Promise<T>,
  ): Promise<T>;
  // Уникальный индекс на name (P2002).
  isUniqueViolation(error: unknown): boolean;
}
