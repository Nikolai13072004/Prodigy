import type { Permission } from "@/lib/roles";
import {
  isSystemRoleRenameAttempt,
  validateRolePermissionsForm,
} from "../domain/role-profile-form";
import { RoleProfileApplicationError } from "./role-profile-errors";
import type {
  RoleProfileRepository,
  RoleProfileTransaction,
} from "./role-profile-ports";
import type { UserAudit } from "./ports";

// Use-case-набор для управления ролями: создание, обновление (с каскадным
// переименованием User.role), удаление (с проверкой занятости), назначение
// ролей пользователю. Аудит пишется в той же транзакции, что и мутация.

export type RoleActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type RoleAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

function serializePermissions(permissions: Permission[]) {
  return JSON.stringify([...new Set(permissions)].sort());
}

function buildAudit(
  actor: RoleActor,
  audit: RoleAuditContext,
  fields: {
    action: string;
    objectType: string;
    objectId: string;
    objectLabel: string;
    metadata: unknown;
  },
): UserAudit {
  return {
    actorId: actor.id,
    actorLogin: actor.login,
    actorName: actor.name,
    action: fields.action,
    objectType: fields.objectType,
    objectId: fields.objectId,
    objectLabel: fields.objectLabel,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
    metadata: fields.metadata,
  };
}

export type ManageRoleProfilesDeps = {
  repository: RoleProfileRepository;
};

export function createManageRoleProfiles(deps: ManageRoleProfilesDeps) {
  const { repository } = deps;

  async function recordRoleAudit(
    tx: RoleProfileTransaction,
    audit: UserAudit,
  ) {
    await tx.recordEffects({ audit });
  }

  return {
    async createRole(command: {
      name: string;
      permissions: Permission[];
      actor: RoleActor;
      audit: RoleAuditContext;
    }): Promise<{ roleId: string; name: string }> {
      const formError = validateRolePermissionsForm(
        command.name,
        command.permissions,
      );
      if (formError) {
        throw new RoleProfileApplicationError("VALIDATION_FAILED", formError);
      }

      try {
        return await repository.transact(async (tx) => {
          const created = await tx.createRole({
            name: command.name,
            permissionsJson: serializePermissions(command.permissions),
          });
          await recordRoleAudit(
            tx,
            buildAudit(command.actor, command.audit, {
              action: "roles:create",
              objectType: "role",
              objectId: created.id,
              objectLabel: created.name,
              metadata: { permissions: command.permissions },
            }),
          );
          return { roleId: created.id, name: created.name };
        });
      } catch (error) {
        if (repository.isUniqueViolation(error)) {
          throw new RoleProfileApplicationError(
            "NAME_TAKEN",
            "Роль с таким названием уже существует",
          );
        }
        throw error;
      }
    },

    async updateRole(command: {
      roleId: string;
      name: string;
      permissions: Permission[];
      actor: RoleActor;
      audit: RoleAuditContext;
    }): Promise<{ renamed: boolean }> {
      const formError = validateRolePermissionsForm(
        command.name,
        command.permissions,
      );
      if (formError) {
        throw new RoleProfileApplicationError("VALIDATION_FAILED", formError);
      }

      const current = await repository.findRoleById(command.roleId);
      if (!current) {
        throw new RoleProfileApplicationError("NOT_FOUND", "Роль не найдена");
      }
      if (isSystemRoleRenameAttempt(current, command.name)) {
        throw new RoleProfileApplicationError(
          "SYSTEM_ROLE_RENAME",
          "Системные роли нельзя переименовывать",
        );
      }

      const renamed = command.name !== current.name;
      try {
        await repository.transact(async (tx) => {
          await tx.updateRole({
            roleId: command.roleId,
            name: command.name,
            permissionsJson: serializePermissions(command.permissions),
          });
          if (renamed) {
            await tx.renameUsersRole(current.name, command.name);
          }
          await recordRoleAudit(
            tx,
            buildAudit(command.actor, command.audit, {
              action: "roles:update",
              objectType: "role",
              objectId: command.roleId,
              objectLabel: command.name,
              metadata: {
                previousName: current.name,
                permissions: command.permissions,
                renamed,
              },
            }),
          );
        });
      } catch (error) {
        if (repository.isUniqueViolation(error)) {
          throw new RoleProfileApplicationError(
            "NAME_TAKEN",
            "Роль с таким названием уже существует",
          );
        }
        throw error;
      }
      return { renamed };
    },

    async deleteRole(command: {
      roleId: string;
      actor: RoleActor;
      audit: RoleAuditContext;
    }): Promise<{ name: string; permissionsJson: string }> {
      const role = await repository.findRoleById(command.roleId);
      if (!role) {
        throw new RoleProfileApplicationError("NOT_FOUND", "Роль не найдена");
      }
      if (role.isSystem) {
        throw new RoleProfileApplicationError(
          "SYSTEM_ROLE_DELETE",
          "Системную роль удалять нельзя",
        );
      }

      const usersCount = await repository.countUsersWithRole(
        role.id,
        role.name,
      );
      if (usersCount > 0) {
        throw new RoleProfileApplicationError(
          "ROLE_IN_USE",
          "Нельзя удалить роль, пока она назначена пользователям",
        );
      }

      await repository.transact(async (tx) => {
        await tx.deleteRole(role.id);
        await recordRoleAudit(
          tx,
          buildAudit(command.actor, command.audit, {
            action: "roles:delete",
            objectType: "role",
            objectId: role.id,
            objectLabel: role.name,
            metadata: { permissionsJson: role.permissionsJson },
          }),
        );
      });

      return { name: role.name, permissionsJson: role.permissionsJson };
    },

    async setUserRole(command: {
      userId: string;
      roleNames: string[];
      primaryRoleName: string;
      actor: RoleActor;
      audit: RoleAuditContext;
    }): Promise<void> {
      if (!command.primaryRoleName) {
        throw new RoleProfileApplicationError(
          "NO_ROLE_SELECTED",
          "Роль не выбрана",
        );
      }
      const roles = await repository.loadRoleProfilesByNames(command.roleNames);
      if (roles.length !== command.roleNames.length) {
        throw new RoleProfileApplicationError(
          "UNKNOWN_ROLE",
          "Одна или несколько выбранных ролей не существуют",
        );
      }

      await repository.transact(async (tx) => {
        await tx.setUserRole({
          userId: command.userId,
          primaryRoleName: command.primaryRoleName,
          roleProfileIds: roles.map((role) => role.id),
        });
        await recordRoleAudit(
          tx,
          buildAudit(command.actor, command.audit, {
            action: "users:set_roles",
            objectType: "user",
            objectId: command.userId,
            objectLabel: command.primaryRoleName,
            metadata: { roleNames: command.roleNames },
          }),
        );
      });
    },
  };
}
