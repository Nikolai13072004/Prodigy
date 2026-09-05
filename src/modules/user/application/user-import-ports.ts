// Порты CSV-импорта пользователей. Репозиторий отвечает только за БД: загрузку
// справочников/занятых логинов-email и атомарное создание пачки пользователей.
// Подготовку секретов (пароль/хеш/токен), письма и аудит держит транспорт.

export type ImportReferenceEntity = { id: string; name: string };

export type ImportReferenceData = {
  roleProfiles: ImportReferenceEntity[];
  groups: ImportReferenceEntity[];
  departments: ImportReferenceEntity[];
  organizations: ImportReferenceEntity[];
  existingUsers: Array<{ email: string | null; login: string }>;
};

export type CreateImportedUserInput = {
  name: string;
  firstName: string;
  lastName: string | null;
  login: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  departmentId: string | null;
  organizationId: string | null;
  roleProfileIds: string[];
  groupId: string | null;
  activation: { tokenHash: string; expiresAt: Date; invitedById: string } | null;
};

export type CreatedImportedUser = {
  id: string;
  name: string;
  email: string | null;
  firstName: string;
  login: string;
};

export interface UserImportRepository {
  loadReferenceData(): Promise<ImportReferenceData>;
  // Создаёт всех пользователей в одной транзакции, сохраняя порядок входа.
  // Бросает при любой ошибке (вся пачка откатывается).
  createImportedUsers(rows: CreateImportedUserInput[]): Promise<CreatedImportedUser[]>;
}
