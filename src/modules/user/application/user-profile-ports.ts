// Порты слоя application для редактирования профиля пользователя (updateUser).
// Держим отдельно от жизненного цикла (archive/restore) — ответственность другая:
// здесь одна большая мутация профиля с ролями, группой и (опционально) паролем.

import type { UserAudit } from "./ports";

export type CurrentUserProfile = {
  id: string;
  name: string;
  firstName: string;
  lastName: string | null;
  login: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  departmentId: string | null;
  organizationId: string | null;
  roleNames: string[];
  groupIds: string[];
};

export type RoleProfileRecord = {
  id: string;
  name: string;
};

// Скалярные поля пользователя, которые пишет applyUpdate. Разделены со ссылками
// (роли/группа) — их пересобирают отдельными таблицами.
export type UserProfileScalarUpdate = {
  name: string;
  firstName: string;
  lastName: string | null;
  login: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  departmentId: string | null;
  organizationId: string | null;
};

export type UserProfileApplyInput = {
  userId: string;
  scalar: UserProfileScalarUpdate;
  passwordHash: string | null;
  roleProfileIds: string[];
  groupId: string | null;
};

export type UserProfileEffects = {
  audit?: UserAudit;
};

export interface UserProfileTransaction {
  applyUpdate(input: UserProfileApplyInput): Promise<void>;
  recordEffects(effects: UserProfileEffects): Promise<void>;
}

export interface UserProfileRepository {
  loadCurrentUser(userId: string): Promise<CurrentUserProfile | null>;
  loadRoleProfilesByNames(names: string[]): Promise<RoleProfileRecord[]>;
  checkGroupExists(groupId: string): Promise<boolean>;
  checkDepartmentExists(departmentId: string): Promise<boolean>;
  checkOrganizationExists(organizationId: string): Promise<boolean>;
  transact<T>(
    execute: (transaction: UserProfileTransaction) => Promise<T>,
  ): Promise<T>;
  // Уникальный индекс на login/email (P2002) — гонки двух параллельных апдейтов
  // распознаёт инфраструктура, use-case превращает в понятное сообщение.
  isUniqueViolation(error: unknown): boolean;
}
