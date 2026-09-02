// Порты активации аккаунта по токену (activateUserAccount).
// Токен активации хешируется внутри инфраструктуры — в use-case ходит «сырой» токен.

export type ActivationInviteUser = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  status: string;
};

export type ActivationInviteRecord = {
  id: string;
  userId: string;
  status: string;
  expiresAt: Date;
  user: ActivationInviteUser;
};

export type ActivateAccountInput = {
  userId: string;
  passwordHash: string;
  inviteId: string;
};

export interface UserActivationRepository {
  findActivationByToken(token: string): Promise<ActivationInviteRecord | null>;
  markActivationExpired(id: string): Promise<void>;
  // Транзакция: новый passwordHash + status ACTIVE + снятие блокировки логина
  // + пометка приглашения ACCEPTED (activatedAt).
  activateAccount(input: ActivateAccountInput): Promise<void>;
}
