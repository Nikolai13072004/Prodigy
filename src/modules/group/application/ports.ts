// Порты модуля групп. Аудит пишется в одной транзакции с мутацией (ADR-005).

export type GroupAudit = {
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

export type GroupRecord = {
  id: string;
  name: string;
};

export type GroupCardRecord = {
  id: string;
  name: string;
  description: string | null;
};

// Контекст для изменения состава: текущие участники + курсы группы (для
// точечной ревалидации на транспорте).
export type GroupMembershipContext = {
  id: string;
  name: string;
  memberUserIds: string[];
  courseIds: string[];
};

export type GroupEffects = {
  audit: GroupAudit;
};

export interface GroupTransaction {
  createGroup(name: string, description: string | null): Promise<GroupRecord>;
  updateGroup(id: string, name: string, description: string | null): Promise<void>;
  replaceMemberships(groupId: string, userIds: string[]): Promise<void>;
  recordEffects(effects: GroupEffects): Promise<void>;
}

export interface GroupRepository {
  findCard(id: string): Promise<GroupCardRecord | null>;
  findMembershipContext(id: string): Promise<GroupMembershipContext | null>;
  // Из переданных id возвращает те, что являются активными учениками
  // (не BLOCKED/ARCHIVED, роль «Ученик»). Use-case сверяет по длине.
  filterEligibleStudentIds(userIds: string[]): Promise<string[]>;
  transact<T>(execute: (transaction: GroupTransaction) => Promise<T>): Promise<T>;
  isUniqueViolation(error: unknown): boolean;
}
