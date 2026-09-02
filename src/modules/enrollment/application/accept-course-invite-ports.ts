// Порты приёма приглашения на курс (acceptCourseInvite).
// Токен хешируется внутри инфраструктуры — сюда приходит уже «сырой» токен.

export type InviteRecord = {
  id: string;
  courseId: string;
  email: string;
  status: string;
  expiresAt: Date;
  accessExpiresAt: Date | null;
  course: { id: string; title: string };
};

// Существующий по email пользователь — форма, которую разбирает доменное
// решение resolveExistingUserInviteAcceptance.
export type ExistingUserRecord = {
  id: string;
  status: string;
  login: string;
  role: string;
  userRoles: Array<{ roleProfile: { name: string } }>;
};

export type AcceptExistingUserInput = {
  inviteId: string;
  courseId: string;
  userId: string;
  accessExpiresAt: Date | null;
};

export type CreateUserAndAcceptInput = {
  inviteId: string;
  courseId: string;
  name: string;
  login: string;
  email: string;
  passwordHash: string;
  studentRoleProfileId: string;
  accessExpiresAt: Date | null;
};

export interface CourseInviteRepository {
  findInviteByToken(token: string): Promise<InviteRecord | null>;
  markInviteExpired(inviteId: string): Promise<void>;
  findStudentRoleProfileId(): Promise<string | null>;
  findUserByEmail(email: string): Promise<ExistingUserRecord | null>;
  findUserIdByLogin(login: string): Promise<string | null>;
  // Транзакция: upsert назначения (с продлением окна доступа) + пометка инвайта ACCEPTED.
  acceptForExistingUser(input: AcceptExistingUserInput): Promise<void>;
  // Транзакция: создание ученика + назначение + пометка ACCEPTED. Может бросить
  // ошибку уникальности (логин/email заняты гонкой) — use-case её распознаёт.
  createUserAndAccept(input: CreateUserAndAcceptInput): Promise<void>;
  isUniqueViolation(error: unknown): boolean;
}
