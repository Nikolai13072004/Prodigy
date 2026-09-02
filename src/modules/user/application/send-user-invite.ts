import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";
import { UserApplicationError } from "./errors";
import type {
  UserCredentialsInviteRecipient,
  UserCredentialsRepository,
} from "./user-credentials-ports";

// Use-case: отправка приглашения (временного пароля) существующему
// пользователю. Мутация та же, что и у reset-password, но с дополнительными
// предусловиями: HR может слать приглашения только ученикам, архивным нельзя.
// Аудит остаётся на транспорте — inviteQueued зависит от факта enqueue.

export type SendUserInviteCommand = {
  userId: string;
  canEditAccessLevel: boolean;
  newPassword: string;
};

export type SendUserInviteResult = {
  user: UserCredentialsInviteRecipient;
};

export type SendUserInviteDeps = {
  repository: UserCredentialsRepository;
  hashPassword: (password: string) => Promise<string>;
};

export function createSendUserInvite(deps: SendUserInviteDeps) {
  const { repository, hashPassword } = deps;

  return async function sendUserInvite(
    command: SendUserInviteCommand,
  ): Promise<SendUserInviteResult> {
    const user = await repository.findUserForInvite(command.userId);
    if (!user) {
      throw new UserApplicationError("NOT_FOUND", "Пользователь не найден.");
    }
    if (
      !command.canEditAccessLevel &&
      !user.roleNames.includes(STANDARD_ROLE_NAMES.STUDENT)
    ) {
      // Отдельный код: транспорт в этом случае редиректит в список
      // пользователей, а не в форму редактирования (как в оригинале).
      throw new UserApplicationError(
        "HR_FORBIDDEN",
        "Недостаточно прав для отправки приглашения этому пользователю.",
      );
    }
    if (user.status === USER_STATUSES.ARCHIVED) {
      throw new UserApplicationError(
        "VALIDATION_FAILED",
        "Нельзя отправить приглашение архивированному пользователю.",
      );
    }
    if (!user.email) {
      throw new UserApplicationError(
        "VALIDATION_FAILED",
        "У пользователя не указан email для отправки приглашения.",
      );
    }
    if (!command.newPassword) {
      throw new UserApplicationError(
        "VALIDATION_FAILED",
        "Не удалось подготовить временный пароль.",
      );
    }

    const passwordHash = await hashPassword(command.newPassword);

    await repository.transact(async (tx) => {
      await tx.resetPasswordAndCancelResetTokens(user.id, passwordHash);
    });

    return { user };
  };
}
