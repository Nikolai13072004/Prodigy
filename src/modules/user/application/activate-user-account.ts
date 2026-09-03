import { ActivateUserAccountError } from "./activate-user-account-errors";
import type {
  ActivationInviteUser,
  UserActivationRepository,
} from "./activate-user-account-ports";

// Use-case = решение + атомарная мутация БД. Аудит остаётся на транспорте
// (адресат — сам активируемый пользователь), как в соседних credential-флоу.

export type ActivateUserAccountCommand = {
  token: string;
  password: string;
};

export type ActivateUserAccountResult = {
  user: ActivationInviteUser;
  inviteId: string;
};

export function createActivateUserAccount(deps: {
  repository: UserActivationRepository;
  hashPassword: (password: string) => Promise<string>;
}) {
  const { repository, hashPassword } = deps;

  return async function activateUserAccount(
    command: ActivateUserAccountCommand,
  ): Promise<ActivateUserAccountResult> {
    const invite = await repository.findActivationByToken(command.token);
    if (!invite) {
      throw new ActivateUserAccountError(
        "NOT_FOUND",
        "Ссылка активации не найдена или уже недействительна.",
      );
    }
    if (invite.status !== "PENDING") {
      throw new ActivateUserAccountError(
        "NOT_PENDING",
        invite.status === "ACCEPTED"
          ? "Эта ссылка активации уже использована."
          : "Ссылка активации больше не активна.",
      );
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await repository.markActivationExpired(invite.id);
      throw new ActivateUserAccountError(
        "EXPIRED",
        "Срок действия ссылки активации истек. Попросите администратора отправить новое приглашение.",
      );
    }

    const passwordHash = await hashPassword(command.password);
    await repository.activateAccount({
      userId: invite.userId,
      passwordHash,
      inviteId: invite.id,
    });

    return { user: invite.user, inviteId: invite.id };
  };
}
