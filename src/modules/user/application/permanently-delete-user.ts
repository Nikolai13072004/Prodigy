import { USER_STATUSES } from "@/lib/users";
import { UserApplicationError } from "./errors";
import type {
  UserAudit,
  UserLifecycleRepository,
  UserRecord,
} from "./ports";

// Use-case: окончательное (hard-delete) удаление ранее архивированного
// пользователя. Правила: нельзя удалять текущего пользователя, только ARCHIVED.
// Каскадно чистит незавершённые письма и связанные CourseInvite, чтобы
// освободить login/email для повторного использования.

export type PermanentlyDeleteUserAuditContext = {
  actorId: string;
  actorLogin: string | null;
  actorName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type PermanentlyDeleteUserCommand = {
  userId: string;
  currentUserId: string;
  audit: PermanentlyDeleteUserAuditContext;
};

export type PermanentlyDeleteUserResult = {
  user: UserRecord;
};

export type PermanentlyDeleteUserDeps = {
  repository: UserLifecycleRepository;
};

export function createPermanentlyDeleteUser(
  deps: PermanentlyDeleteUserDeps,
) {
  const { repository } = deps;

  return async function permanentlyDeleteUser(
    command: PermanentlyDeleteUserCommand,
  ): Promise<PermanentlyDeleteUserResult> {
    if (command.userId === command.currentUserId) {
      throw new UserApplicationError(
        "SELF_BLOCK",
        "Нельзя удалить текущего пользователя.",
      );
    }

    return repository.transact(async (tx) => {
      const [existing] = await tx.findUsersByIds([command.userId]);
      if (!existing) {
        throw new UserApplicationError("NOT_FOUND", "Пользователь не найден.");
      }
      if (existing.status !== USER_STATUSES.ARCHIVED) {
        throw new UserApplicationError(
          "VALIDATION_FAILED",
          "Окончательно удалить можно только архивированного пользователя.",
        );
      }

      if (existing.email) {
        await tx.deleteUserEmailJobsByEmail(existing.email);
        await tx.deleteCourseInvitesByEmail(existing.email);
      }
      await tx.deleteCourseInvitesByAcceptedUserId(existing.id);
      await tx.hardDeleteUser(existing.id);

      const audit: UserAudit = {
        actorId: command.audit.actorId,
        actorLogin: command.audit.actorLogin,
        actorName: command.audit.actorName,
        action: "users:delete_permanently",
        objectType: "user",
        objectId: existing.id,
        objectLabel: existing.name,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          login: existing.login,
          email: existing.email,
          previousStatus: existing.status,
        },
      };
      await tx.recordEffects({ audit });

      return { user: existing };
    });
  };
}
