// Порты слоя application для операций жизненного цикла пользователя (архив /
// восстановление / массовый архив). По образцу certification (ADR-012):
// use-case и тесты зависят только от этих интерфейсов, Prisma инжектируется
// через инфраструктуру.

export type UserRecord = {
  id: string;
  login: string;
  email: string | null;
  name: string;
  status: string;
};

// Аудит-запись пишется в одной транзакции с мутацией (ADR-005): расхождение
// «изменение прошло, а лога нет» невозможно. IP/User-Agent приходят из
// транспорта — на уровне инфраструктуры их взять неоткуда.
export type UserAudit = {
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  objectLabel: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
};

export type UserLifecycleEffects = {
  audit?: UserAudit;
};

export interface UserLifecycleTransaction {
  findUsersByIds(userIds: string[]): Promise<UserRecord[]>;
  // Меняет статус и сбрасывает failedLoginAttempts / loginLockedUntil —
  // блокировка входа привязана к статусу, оставлять её после смены нет смысла.
  changeUserStatuses(userIds: string[], nextStatus: string): Promise<void>;
  cancelPendingInvites(userIds: string[]): Promise<void>;
  // Каскадные подчистки перед удалением пользователя. Держим отдельные методы,
  // чтобы транспорт (или use-case) вызвал их только когда нужно, а не всегда.
  deleteUserEmailJobsByEmail(email: string): Promise<void>;
  deleteCourseInvitesByEmail(email: string): Promise<void>;
  deleteCourseInvitesByAcceptedUserId(userId: string): Promise<void>;
  hardDeleteUser(userId: string): Promise<void>;
  recordEffects(effects: UserLifecycleEffects): Promise<void>;
}

export interface UserLifecycleRepository {
  transact<T>(
    execute: (transaction: UserLifecycleTransaction) => Promise<T>,
  ): Promise<T>;
}
