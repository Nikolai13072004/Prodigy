import { USER_STATUSES } from "@/lib/users";
import { UserApplicationError } from "./errors";
import type {
  UserAudit,
  UserLifecycleRepository,
  UserRecord,
} from "./ports";

// Use-case: soft-delete одного пользователя (перевод в ARCHIVED).
// Правила:
//   - нельзя архивировать самого себя (SELF_BLOCK);
//   - если пользователь не найден — NOT_FOUND;
//   - если уже архивирован — ALREADY_ARCHIVED, без повторных мутаций.
// Аудит и отмена приглашений идут в одной транзакции с изменением статуса.

export type ArchiveUserAuditContext = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type ArchiveUserCommand = {
  userId: string;
  currentUserId: string;
  audit: ArchiveUserAuditContext;
};

export type ArchiveUserResult = {
  user: UserRecord;
  previousStatus: string;
};

export type ArchiveUserDeps = {
  repository: UserLifecycleRepository;
};

export function createArchiveUser(deps: ArchiveUserDeps) {
  const { repository } = deps;

  return async function archiveUser(
    command: ArchiveUserCommand,
  ): Promise<ArchiveUserResult> {
    if (command.userId === command.currentUserId) {
      throw new UserApplicationError(
        "SELF_BLOCK",
        "Нельзя архивировать текущего пользователя.",
      );
    }

    return repository.transact(async (tx) => {
      const [existing] = await tx.findUsersByIds([command.userId]);
      if (!existing) {
        throw new UserApplicationError(
          "NOT_FOUND",
          "Пользователь не найден.",
        );
      }
      if (existing.status === USER_STATUSES.ARCHIVED) {
        throw new UserApplicationError(
          "ALREADY_ARCHIVED",
          "Пользователь уже архивирован.",
        );
      }

      await tx.changeUserStatuses([existing.id], USER_STATUSES.ARCHIVED);
      await tx.cancelPendingInvites([existing.id]);

      const audit: UserAudit = {
        actorId: command.audit.actorId,
        actorLogin: command.audit.actorLogin,
        actorName: command.audit.actorName,
        action: "users:archive",
        objectType: "user",
        objectId: existing.id,
        objectLabel: existing.name,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          login: existing.login,
          email: existing.email,
          previousStatus: existing.status,
          nextStatus: USER_STATUSES.ARCHIVED,
        },
      };
      await tx.recordEffects({ audit });

      return { user: existing, previousStatus: existing.status };
    });
  };
}
