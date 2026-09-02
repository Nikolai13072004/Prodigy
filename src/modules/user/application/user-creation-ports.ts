// Порты слоя application для создания пользователя (createUser).
// Держим отдельно от profile/lifecycle: тут одна инсерт-транзакция плюс
// (опционально) userActivationInvite; повторного использования методов из
// UserProfileRepository не нужно.

import type { UserAudit } from "./ports";

export type CreatedUserRecord = {
  id: string;
  email: string | null;
  login: string;
  name: string;
  firstName: string;
};

export type CreateUserInput = {
  name: string;
  firstName: string;
  lastName: string | null;
  login: string;
  email: string | null;
  passwordHash: string;
  role: string;
  status: string;
  departmentId: string | null;
  organizationId: string | null;
  roleProfileIds: string[];
  groupId: string | null;
};

export type CreateActivationInviteInput = {
  userId: string;
  email: string;
  tokenHash: string;
  invitedById: string | null;
  expiresAt: Date;
};

export type UserCreationEffects = {
  audit?: UserAudit;
};

export interface UserCreationTransaction {
  createUser(input: CreateUserInput): Promise<CreatedUserRecord>;
  createActivationInvite(input: CreateActivationInviteInput): Promise<void>;
  recordEffects(effects: UserCreationEffects): Promise<void>;
}

export type RoleProfileRecord = {
  id: string;
  name: string;
};

export interface UserCreationRepository {
  loadRoleProfilesByNames(names: string[]): Promise<RoleProfileRecord[]>;
  checkGroupExists(groupId: string): Promise<boolean>;
  checkDepartmentExists(departmentId: string): Promise<boolean>;
  checkOrganizationExists(organizationId: string): Promise<boolean>;
  transact<T>(
    execute: (transaction: UserCreationTransaction) => Promise<T>,
  ): Promise<T>;
  // Гонка по уникальному индексу login/email распознаётся здесь, use-case
  // превращает её в понятное сообщение вместо крешa.
  isUniqueViolation(error: unknown): boolean;
}
