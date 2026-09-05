import {
  type PlatformSecuritySettingsState,
  validatePasswordAgainstPolicy,
} from "@/lib/platform-settings";
import { buildUserDisplayName } from "@/lib/users";
import { UserApplicationError } from "./errors";
import type {
  CreatedUserRecord,
  UserCreationRepository,
} from "./user-creation-ports";
import type { UserAudit } from "./ports";

// Use-case: создание нового пользователя (createUser). Валидации, атомарная
// запись user + userRoles + groupMembership (+ опционально activationInvite)
// и аудит — всё одной транзакцией. Отправка писем остаётся за транспортом:
// это отдельная запись в очередь EmailJob и её судьба не должна ронять
// создание аккаунта.

export type CreateUserAccountActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type CreateUserAccountAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type CreateUserAccountFields = {
  firstName: string;
  lastName: string | null;
  login: string; // уже приведён к lower-case транспортом
  email: string | null;
  departmentId: string; // "" если не выбрано
  organizationId: string;
  groupId: string;
};

export type CreateUserAccountPlan = {
  roles: string[];
  role: string;
  status: string;
  password: string;
  needsActivationToken: boolean;
  shouldSendInvite: boolean;
};

export type CreateUserAccountCommand = {
  actor: CreateUserAccountActor;
  audit: CreateUserAccountAuditContext;
  fields: CreateUserAccountFields;
  plan: CreateUserAccountPlan;
  security: PlatformSecuritySettingsState;
};

export type CreateUserActivationTokenIssued = {
  token: string;
  tokenHash: string;
};

export type CreateUserAccountResult = {
  user: CreatedUserRecord;
  activationToken: CreateUserActivationTokenIssued | null;
};

export type CreateUserAccountDeps = {
  repository: UserCreationRepository;
  hashPassword: (password: string) => Promise<string>;
  generateActivationToken: () => CreateUserActivationTokenIssued;
  // Время старта для вычисления expiresAt: инжектируется, чтобы тесты не
  // зависели от системных часов.
  now: () => Date;
};

function fail(message: string): never {
  throw new UserApplicationError("VALIDATION_FAILED", message);
}

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

export function createCreateUserAccount(deps: CreateUserAccountDeps) {
  const { repository, hashPassword, generateActivationToken, now } = deps;

  return async function createUserAccount(
    command: CreateUserAccountCommand,
  ): Promise<CreateUserAccountResult> {
    const { fields, plan, security } = command;
    const displayName = buildUserDisplayName(fields.firstName, fields.lastName);

    if (!fields.firstName) fail("Имя обязательно");
    if (!fields.login) fail("Логин обязателен");
    if (!fields.email) fail("Email обязателен");
    if (!plan.password) fail("Пароль обязателен");

    const policyError = validatePasswordAgainstPolicy(plan.password, security);
    if (policyError) fail(policyError);
    if (!plan.role) fail("Выберите хотя бы одну роль");

    if (
      fields.groupId &&
      !(await repository.checkGroupExists(fields.groupId))
    ) {
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

    const roleProfiles = await repository.loadRoleProfilesByNames(plan.roles);
    if (roleProfiles.length !== plan.roles.length) {
      fail("Одна или несколько выбранных ролей не существуют");
    }

    const passwordHash = await hashPassword(plan.password);
    const activationToken = plan.needsActivationToken
      ? generateActivationToken()
      : null;

    try {
      return await repository.transact(async (tx) => {
        const user = await tx.createUser({
          name: displayName,
          firstName: fields.firstName,
          lastName: fields.lastName,
          login: fields.login,
          email: fields.email,
          passwordHash,
          role: plan.role,
          status: plan.status,
          departmentId: fields.departmentId || null,
          organizationId: fields.organizationId || null,
          roleProfileIds: roleProfiles.map((profile) => profile.id),
          groupId: fields.groupId || null,
        });

        if (activationToken && user.email) {
          const expiresAt = new Date(
            now().getTime() +
              daysToMs(security.userActivationInviteTtlDays),
          );
          await tx.createActivationInvite({
            userId: user.id,
            email: user.email,
            tokenHash: activationToken.tokenHash,
            invitedById: command.actor.id,
            expiresAt,
          });
        }

        const audit: UserAudit = {
          actorId: command.actor.id,
          actorLogin: command.actor.login,
          actorName: command.actor.name,
          action: "users:create",
          objectType: "user",
          objectId: user.id,
          objectLabel: user.name,
          ipAddress: command.audit.ipAddress,
          userAgent: command.audit.userAgent,
          metadata: {
            login: user.login,
            email: user.email,
            roles: plan.roles,
            status: plan.status,
            groupId: fields.groupId || null,
            departmentId: fields.departmentId || null,
            organizationId: fields.organizationId || null,
            // Точно повторяет прежнее сообщение аудита: «в очередь письмо
            // не поставили, но собирались» — фиксируем намерение, а не факт.
            inviteQueued: plan.shouldSendInvite && Boolean(user.email),
          },
        };
        await tx.recordEffects({ audit });

        return { user, activationToken };
      });
    } catch (error) {
      if (repository.isUniqueViolation(error)) {
        fail("Пользователь с таким логином или email уже существует");
      }
      throw error;
    }
  };
}
