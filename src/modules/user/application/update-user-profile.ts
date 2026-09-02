import {
  STANDARD_ROLE_NAMES,
  primaryRole,
} from "@/lib/roles";
import { USER_STATUSES, buildUserDisplayName } from "@/lib/users";
import {
  type PlatformSecuritySettingsState,
  validatePasswordAgainstPolicy,
} from "@/lib/platform-settings";
import { haveRolesChanged } from "../domain/user-profile-update";
import { isSelfBlockAttempt } from "../domain/user-profile-update";
import { resolveEditedUserStatus } from "../domain/user-profile-update";
import { UserApplicationError } from "./errors";
import type {
  CurrentUserProfile,
  UserProfileRepository,
} from "./user-profile-ports";
import type { UserAudit } from "./ports";

// Use-case: полное обновление профиля (updateUser). Собирает финальные
// значения полей, валидирует их (роли/статус/пароль/группа/отдел/организация),
// применяет одной транзакцией с аудитом. Второй guard на смену ролей
// прокидывается транспортом через authorizeRoleChange — это позволяет держать
// проверку прав в транспорте, но синхронно с моментом смены ролей.

export type UpdateUserProfileActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type UpdateUserProfileAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type UpdateUserProfileFields = {
  firstName: string;
  lastName: string | null;
  loginInput: string; // уже приведён к lower-case транспортом
  email: string | null;
  password: string;
  passwordConfirm: string;
  groupId: string; // "" если не выбрана
  departmentId: string;
  organizationId: string;
  avatarUrl: string | null | "invalid";
  statusRaw: string;
  statusControl: string;
  activeUserChecked: boolean;
  submittedRoles: string[]; // применяем только если canEditAccessLevel
};

export type UpdateUserProfileCommand = {
  userId: string;
  canEditAccessLevel: boolean;
  fields: UpdateUserProfileFields;
  security: PlatformSecuritySettingsState;
  actor: UpdateUserProfileActor;
  audit: UpdateUserProfileAuditContext;
  // Вызывается перед транзакцией, если фактический набор ролей меняется.
  // По умолчанию — no-op (для тестов); транспорт передаёт вторую проверку
  // requirePermission(USERS_EDIT_ACCESS_LEVEL), чтобы поймать рассинхрон
  // локальной копии permissions с актуальной сессией.
  authorizeRoleChange?: () => Promise<void>;
};

export type UpdateUserProfileResult = {
  userId: string;
  displayName: string;
  rolesChanged: boolean;
  passwordUpdated: boolean;
};

export type UpdateUserProfileDeps = {
  repository: UserProfileRepository;
  // Инжектируется, чтобы тесты не тянули bcrypt.
  hashPassword: (password: string) => Promise<string>;
};

function fail(message: string): never {
  throw new UserApplicationError("VALIDATION_FAILED", message);
}

function metadataSnapshot(
  current: CurrentUserProfile,
  next: {
    firstName: string;
    lastName: string | null;
    name: string;
    login: string;
    email: string | null;
    avatarUrl: string | null;
    roles: string[];
    status: string;
    departmentId: string | null;
    organizationId: string | null;
    groupIds: string[];
  },
  passwordUpdated: boolean,
) {
  return {
    previous: {
      name: current.name,
      firstName: current.firstName,
      lastName: current.lastName,
      login: current.login,
      email: current.email,
      avatarUrl: current.avatarUrl,
      roles: current.roleNames,
      status: current.status,
      departmentId: current.departmentId,
      organizationId: current.organizationId,
      groupIds: current.groupIds,
    },
    next,
    passwordUpdated,
  };
}

export function createUpdateUserProfile(deps: UpdateUserProfileDeps) {
  const { repository, hashPassword } = deps;

  return async function updateUserProfile(
    command: UpdateUserProfileCommand,
  ): Promise<UpdateUserProfileResult> {
    const current = await repository.loadCurrentUser(command.userId);
    if (!current) {
      throw new UserApplicationError("NOT_FOUND", "Пользователь не найден.");
    }

    const { fields } = command;
    const displayName = buildUserDisplayName(fields.firstName, fields.lastName);
    // Логин доступен для правки только с USERS_EDIT_ACCESS_LEVEL — HR его
    // не меняет, забираем текущий.
    const login = command.canEditAccessLevel
      ? fields.loginInput
      : current.login;

    if (!fields.firstName) fail("Имя обязательно");
    if (!login) fail("Логин обязателен");
    if (fields.avatarUrl === "invalid") fail("Некорректный адрес аватара");

    const currentIsStudent = current.roleNames.includes(
      STANDARD_ROLE_NAMES.STUDENT,
    );
    if (!command.canEditAccessLevel && !currentIsStudent) {
      fail("HR может редактировать только учеников.");
    }

    const roles = command.canEditAccessLevel
      ? [...new Set(fields.submittedRoles.filter(Boolean))]
      : current.roleNames;
    const nextPrimary = primaryRole(roles) ?? current.role;
    const nextStatus = resolveEditedUserStatus({
      canEditAccessLevel: command.canEditAccessLevel,
      statusControl: fields.statusControl,
      currentStatus: current.status,
      activeUserChecked: fields.activeUserChecked,
      statusRaw: fields.statusRaw,
    });

    if (
      isSelfBlockAttempt({
        sessionUserId: command.actor.id,
        targetUserId: current.id,
        nextStatus,
        currentStatus: current.status,
      })
    ) {
      fail("Нельзя заблокировать текущего пользователя");
    }

    if (!nextPrimary) fail("Выберите хотя бы одну роль");

    const roleProfiles = await repository.loadRoleProfilesByNames(roles);
    if (roleProfiles.length !== roles.length) {
      fail("Одна или несколько выбранных ролей не существуют");
    }

    const rolesChanged = haveRolesChanged(current.roleNames, roles);
    if (rolesChanged && command.authorizeRoleChange) {
      // Двойной guard от рассинхрона сессии — держится в транспорте, вызывается
      // отсюда, чтобы синхронно с фактической сменой ролей (а не при загрузке).
      await command.authorizeRoleChange();
    }

    if (
      !command.canEditAccessLevel &&
      (fields.password || fields.passwordConfirm)
    ) {
      fail("Недостаточно прав для изменения пароля");
    }

    let passwordHash: string | null = null;
    if (
      command.canEditAccessLevel &&
      (fields.password || fields.passwordConfirm)
    ) {
      if (current.status === USER_STATUSES.ARCHIVED) {
        fail("Нельзя менять пароль архивного пользователя");
      }
      if (!fields.password || !fields.passwordConfirm) {
        fail("Введите новый пароль и подтверждение");
      }
      if (fields.password !== fields.passwordConfirm) {
        fail("Пароли не совпадают");
      }
      const policyError = validatePasswordAgainstPolicy(
        fields.password,
        command.security,
      );
      if (policyError) fail(policyError);
      passwordHash = await hashPassword(fields.password);
    }

    if (fields.groupId && !(await repository.checkGroupExists(fields.groupId))) {
      fail("Выбранная группа не существует");
    }
    if (
      fields.departmentId &&
      !(await repository.checkDepartmentExists(fields.departmentId))
    ) {
      fail("Выбранное подразделение не существует");
    }
    if (
      fields.organizationId &&
      !(await repository.checkOrganizationExists(fields.organizationId))
    ) {
      fail("Выбранная организация не существует");
    }

    const nextGroupId = fields.groupId || null;
    const nextDepartmentId = fields.departmentId || null;
    const nextOrganizationId = fields.organizationId || null;
    const nextAvatarUrl = fields.avatarUrl === "invalid" ? null : fields.avatarUrl;

    const audit: UserAudit = {
      actorId: command.actor.id,
      actorLogin: command.actor.login,
      actorName: command.actor.name,
      action: "users:update",
      objectType: "user",
      objectId: current.id,
      objectLabel: displayName,
      ipAddress: command.audit.ipAddress,
      userAgent: command.audit.userAgent,
      metadata: metadataSnapshot(
        current,
        {
          firstName: fields.firstName,
          lastName: fields.lastName,
          name: displayName,
          login,
          email: fields.email,
          avatarUrl: nextAvatarUrl,
          roles,
          status: nextStatus,
          departmentId: nextDepartmentId,
          organizationId: nextOrganizationId,
          groupIds: nextGroupId ? [nextGroupId] : [],
        },
        passwordHash !== null,
      ),
    };

    try {
      await repository.transact(async (tx) => {
        await tx.applyUpdate({
          userId: current.id,
          scalar: {
            name: displayName,
            firstName: fields.firstName,
            lastName: fields.lastName,
            login,
            email: fields.email,
            avatarUrl: nextAvatarUrl,
            role: nextPrimary,
            status: nextStatus,
            departmentId: nextDepartmentId,
            organizationId: nextOrganizationId,
          },
          passwordHash,
          roleProfileIds: roleProfiles.map((profile) => profile.id),
          groupId: nextGroupId,
        });
        await tx.recordEffects({ audit });
      });
    } catch (error) {
      if (repository.isUniqueViolation(error)) {
        fail("Пользователь с таким логином или email уже существует");
      }
      throw error;
    }

    return {
      userId: current.id,
      displayName,
      rolesChanged,
      passwordUpdated: passwordHash !== null,
    };
  };
}
