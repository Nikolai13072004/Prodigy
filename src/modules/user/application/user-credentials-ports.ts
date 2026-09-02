// Порты для операций смены пароля / отправки временного доступа:
// resetUserPassword и sendUserInvite. Общая мутация — новый passwordHash +
// сброс блокировки логина + отмена PENDING PasswordResetToken. Отличаются
// только предусловиями (HR-check, archived-check) и адресатом аудита.

import type { UserAudit } from "./ports";

export type UserCredentialsRecipient = {
  id: string;
  login: string;
  email: string | null;
  name: string;
  firstName: string;
};

export type UserCredentialsInviteRecipient = UserCredentialsRecipient & {
  status: string;
  roleNames: string[];
};

export type UserCredentialsEffects = {
  audit?: UserAudit;
};

export interface UserCredentialsTransaction {
  resetPasswordAndCancelResetTokens(
    userId: string,
    passwordHash: string,
  ): Promise<void>;
  recordEffects(effects: UserCredentialsEffects): Promise<void>;
}

export interface UserCredentialsRepository {
  findUserForPasswordReset(
    userId: string,
  ): Promise<UserCredentialsRecipient | null>;
  findUserForInvite(
    userId: string,
  ): Promise<UserCredentialsInviteRecipient | null>;
  transact<T>(
    execute: (transaction: UserCredentialsTransaction) => Promise<T>,
  ): Promise<T>;
}
