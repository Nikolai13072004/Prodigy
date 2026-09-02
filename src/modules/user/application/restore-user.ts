import { USER_STATUSES } from "@/lib/users";
import { UserApplicationError } from "./errors";
import type {
  UserAudit,
  UserLifecycleRepository,
  UserRecord,
} from "./ports";

// Use-case: восстановление архивированного пользователя обратно в ACTIVE.
// Правила: восстановить можно только пользователя со статусом ARCHIVED;
// иначе NOT_ARCHIVED. Не найден — NOT_FOUND. Приглашения не трогаем: при
// архивировании они были отменены, воскрешать их обратно смысла нет.

export type RestoreUserAuditContext = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type RestoreUserCommand = {
  userId: string;
  audit: RestoreUserAuditContext;
};

export type RestoreUserResult = {
  user: UserRecord;
  previousStatus: string;
};

export type RestoreUserDeps = {
  repository: UserLifecycleRepository;
};

export function createRestoreUser(deps: RestoreUserDeps) {
  const { repository } = deps;

  return async function restoreUser(
    command: RestoreUserCommand,
  ): Promise<RestoreUserResult> {
    return repository.transact(async (tx) => {
      const [existing] = await tx.findUsersByIds([command.userId]);
      if (!existing) {
        throw new UserApplicationError(
          "NOT_FOUND",
          "Пользователь не найден.",
        );
      }
      if (existing.status !== USER_STATUSES.ARCHIVED) {
        throw new UserApplicationError(
          "NOT_ARCHIVED",
          "Восстановить можно только архивированного пользователя.",
        );
      }

      await tx.changeUserStatuses([existing.id], USER_STATUSES.ACTIVE);

      const audit: UserAudit = {
        actorId: command.audit.actorId,
        actorLogin: command.audit.actorLogin,
        actorName: command.audit.actorName,
        action: "users:restore",
        objectType: "user",
        objectId: existing.id,
        objectLabel: existing.name,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          login: existing.login,
          email: existing.email,
          previousStatus: existing.status,
          nextStatus: USER_STATUSES.ACTIVE,
        },
      };
      await tx.recordEffects({ audit });

      return { user: existing, previousStatus: existing.status };
    });
  };
}
