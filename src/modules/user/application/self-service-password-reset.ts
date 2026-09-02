import { USER_STATUSES, isAccessRevokedUserStatus } from "@/lib/users";
import { SelfServicePasswordResetError } from "./self-service-password-reset-errors";
import type {
  ResetRequestUser,
  ResetTokenUser,
  SelfServicePasswordResetRepository,
} from "./self-service-password-reset-ports";

// Use-case = только решение + атомарная мутация БД. Постановка письма в очередь
// и аудит остаются на транспорте: метка emailQueued зависит от факта постановки
// письма, а адресат аудита самообслуживания — сам пользователь. Так же устроен
// соседний reset-user-password.

export type IssueResetTokenCommand = {
  identifierVariants: string[];
  tokenHash: string;
  expiresAt: Date;
};

export type IssueResetTokenResult = {
  user: ResetRequestUser | null;
  // issued=true — токен записан (пользователь активен и с email), транспорт шлёт письмо.
  issued: boolean;
};

export function createRequestPasswordReset(deps: {
  repository: SelfServicePasswordResetRepository;
}) {
  const { repository } = deps;

  return async function requestPasswordReset(
    command: IssueResetTokenCommand,
  ): Promise<IssueResetTokenResult> {
    const user = await repository.findUserByIdentifiers(command.identifierVariants);

    if (user?.email && user.status === USER_STATUSES.ACTIVE) {
      await repository.issueResetToken({
        userId: user.id,
        email: user.email,
        tokenHash: command.tokenHash,
        expiresAt: command.expiresAt,
      });
      return { user, issued: true };
    }

    return { user: user ?? null, issued: false };
  };
}

export type ResetWithTokenCommand = {
  token: string;
  password: string;
};

export type ResetWithTokenResult = {
  user: ResetTokenUser;
  tokenId: string;
};

export function createResetPasswordWithToken(deps: {
  repository: SelfServicePasswordResetRepository;
  hashPassword: (password: string) => Promise<string>;
}) {
  const { repository, hashPassword } = deps;

  return async function resetPasswordWithToken(
    command: ResetWithTokenCommand,
  ): Promise<ResetWithTokenResult> {
    const reset = await repository.findResetByToken(command.token);
    if (!reset) {
      throw new SelfServicePasswordResetError(
        "NOT_FOUND",
        "Ссылка сброса пароля не найдена или уже недействительна.",
      );
    }
    if (reset.status !== "PENDING") {
      throw new SelfServicePasswordResetError(
        "NOT_PENDING",
        "Эта ссылка сброса пароля уже использована или отменена.",
      );
    }
    if (reset.expiresAt.getTime() < Date.now()) {
      await repository.markResetExpired(reset.id);
      throw new SelfServicePasswordResetError(
        "EXPIRED",
        "Срок действия ссылки сброса пароля истек. Запросите новую ссылку.",
      );
    }
    if (isAccessRevokedUserStatus(reset.user.status)) {
      throw new SelfServicePasswordResetError(
        "ACCESS_REVOKED",
        "Для восстановления доступа обратитесь к администратору.",
      );
    }

    const passwordHash = await hashPassword(command.password);
    await repository.applyPasswordReset({
      userId: reset.userId,
      passwordHash,
      currentStatus: reset.user.status,
      tokenId: reset.id,
    });

    return { user: reset.user, tokenId: reset.id };
  };
}
