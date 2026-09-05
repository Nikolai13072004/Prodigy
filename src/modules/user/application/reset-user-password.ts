import { UserApplicationError } from "./errors";
import type {
  UserCredentialsRecipient,
  UserCredentialsRepository,
} from "./user-credentials-ports";

// Use-case: сброс пароля пользователю на сгенерированный временный. Транспорт
// сам подготавливает временный пароль (у него есть политика и генератор) —
// use-case отвечает за атомарную мутацию БД (user + отмена PasswordResetToken).
// Аудит остаётся на транспорте: метка inviteQueued зависит от факта
// постановки письма в очередь, а enqueue выполняется уже после мутации.

export type ResetUserPasswordCommand = {
  userId: string;
  newPassword: string;
};

export type ResetUserPasswordResult = {
  user: UserCredentialsRecipient;
};

export type ResetUserPasswordDeps = {
  repository: UserCredentialsRepository;
  hashPassword: (password: string) => Promise<string>;
};

export function createResetUserPassword(deps: ResetUserPasswordDeps) {
  const { repository, hashPassword } = deps;

  return async function resetUserPassword(
    command: ResetUserPasswordCommand,
  ): Promise<ResetUserPasswordResult> {
    const user = await repository.findUserForPasswordReset(command.userId);
    if (!user) {
      throw new UserApplicationError("NOT_FOUND", "Пользователь не найден.");
    }
    if (!user.email) {
      throw new UserApplicationError(
        "VALIDATION_FAILED",
        "У пользователя не указан email для отправки временного пароля.",
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
