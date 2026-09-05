// Порты самостоятельного сброса пароля: запрос ссылки (requestPasswordReset)
// и установка нового пароля по токену (resetPasswordWithToken).
// Токен сброса хешируется внутри инфраструктуры — в use-case ходит «сырой» токен.

// Пользователь, найденный по логину/email при запросе сброса.
export type ResetRequestUser = {
  id: string;
  email: string | null;
  login: string;
  name: string;
  firstName: string | null;
  status: string;
};

// Владелец токена сброса (для установки нового пароля).
export type ResetTokenUser = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  status: string;
};

export type ResetTokenRecord = {
  id: string;
  userId: string;
  status: string;
  expiresAt: Date;
  user: ResetTokenUser;
};

export type IssueResetTokenInput = {
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
};

export type ApplyPasswordResetInput = {
  userId: string;
  passwordHash: string;
  currentStatus: string;
  tokenId: string;
};

export interface SelfServicePasswordResetRepository {
  findUserByIdentifiers(variants: string[]): Promise<ResetRequestUser | null>;
  // Транзакция: отмена прежних PENDING-токенов + создание нового.
  issueResetToken(input: IssueResetTokenInput): Promise<void>;
  findResetByToken(token: string): Promise<ResetTokenRecord | null>;
  markResetExpired(id: string): Promise<void>;
  // Транзакция: новый passwordHash + снятие блокировки логина + перевод
  // PENDING→ACTIVE + пометка этого токена USED + отмена прочих PENDING.
  applyPasswordReset(input: ApplyPasswordResetInput): Promise<void>;
}
