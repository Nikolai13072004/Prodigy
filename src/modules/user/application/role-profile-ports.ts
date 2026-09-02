// Порты для управления ролями (roleProfile) и назначения ролей пользователю.
// Домен формы (validateRolePermissionsForm, isSystemRoleRenameAttempt) уже
// вынесен; здесь — запись/чтение через инфраструктуру.

import type { UserAudit } from "./ports";

export type RoleProfileRecord = {
  id: string;
  name: string;
  isSystem: boolean;
  permissionsJson: string;
};

export type RoleProfileEffects = {
  audit?: UserAudit;
};

export interface RoleProfileTransaction {
  createRole(data: {
    name: string;
    permissionsJson: string;
  }): Promise<{ id: string; name: string }>;
  updateRole(input: {
    roleId: string;
    name: string;
    permissionsJson: string;
  }): Promise<void>;
  // Переименование роли тянет за собой обновление денормализованного
  // User.role — делаем в той же транзакции, чтобы не осталось «висящих» имён.
  renameUsersRole(fromName: string, toName: string): Promise<void>;
  deleteRole(roleId: string): Promise<void>;
  setUserRole(input: {
    userId: string;
    primaryRoleName: string;
    roleProfileIds: string[];
  }): Promise<void>;
  recordEffects(effects: RoleProfileEffects): Promise<void>;
}

export interface RoleProfileRepository {
  findRoleById(roleId: string): Promise<RoleProfileRecord | null>;
  loadRoleProfilesByNames(
    names: string[],
  ): Promise<Array<{ id: string; name: string }>>;
  countUsersWithRole(roleId: string, roleName: string): Promise<number>;
  transact<T>(
    execute: (transaction: RoleProfileTransaction) => Promise<T>,
  ): Promise<T>;
  // Уникальный индекс на roleProfile.name (P2002).
  isUniqueViolation(error: unknown): boolean;
}
