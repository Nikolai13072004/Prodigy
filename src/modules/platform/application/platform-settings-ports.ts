// Порт настроек платформы. Все секции сохраняют одну singleton-строку
// (DEFAULT_PLATFORM_SETTINGS.id) своим срезом полей — отсюда единый upsert.
// Значения полей настроек — примитивы; репозиторий приводит к Prisma-типам.

export type PlatformSettingsWrite = Record<string, string | number | boolean | null>;

export type PlatformAdminCredentials = {
  id: string;
  login: string;
  name: string;
  passwordHash: string | null;
};

export interface PlatformSettingsRepository {
  // Для подтверждения действий паролем текущего администратора.
  findAdminCredentials(userId: string): Promise<PlatformAdminCredentials | null>;
  // create = { id, ...fields }, update = fields (остальные поля — по дефолтам схемы).
  upsertSettings(fields: PlatformSettingsWrite): Promise<void>;
}
