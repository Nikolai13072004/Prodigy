import assert from "node:assert/strict";
import { after, test } from "node:test";
import prisma from "@/lib/prisma";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";
import { prismaPlatformSettingsRepository as repo } from "./prisma-platform-settings-repository";

// Инфра-тест репозитория настроек платформы. Запуск: npm run test:infra.
// Пишет singleton-строку настроек — в конце удаляем её, чтобы getPlatformSettings
// у последующих тестов снова отдавал дефолты (он не создаёт строку сам).

after(async () => {
  await prisma.platformSettings.deleteMany({ where: { id: DEFAULT_PLATFORM_SETTINGS.id } });
  await prisma.$disconnect();
});

test("findAdminCredentials: возвращает пароль-хеш; null для отсутствующего", async () => {
  await prisma.user.create({
    data: { id: "ps-admin", login: "ps-admin", name: "Админ", passwordHash: "hash-x" },
  });
  const creds = await repo.findAdminCredentials("ps-admin");
  assert.equal(creds?.passwordHash, "hash-x");
  assert.equal(creds?.login, "ps-admin");
  assert.equal(await repo.findAdminCredentials("ps-missing"), null);
});

test("upsertSettings: создаёт срез полей, повторный upsert мержит, не затирая прочие секции", async () => {
  await prisma.platformSettings.deleteMany({ where: { id: DEFAULT_PLATFORM_SETTINGS.id } });

  // Секция general
  await repo.upsertSettings({ siteName: "Моя платформа", feedbackEnabled: false });
  let row = await prisma.platformSettings.findUnique({ where: { id: DEFAULT_PLATFORM_SETTINGS.id } });
  assert.equal(row?.siteName, "Моя платформа");
  assert.equal(row?.feedbackEnabled, false);

  // Секция security — прежние поля general не затираются
  await repo.upsertSettings({ passwordMinLength: 12, maintenanceMode: true });
  row = await prisma.platformSettings.findUnique({ where: { id: DEFAULT_PLATFORM_SETTINGS.id } });
  assert.equal(row?.passwordMinLength, 12);
  assert.equal(row?.maintenanceMode, true);
  assert.equal(row?.siteName, "Моя платформа");
});
