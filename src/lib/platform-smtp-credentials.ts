import prisma from "@/lib/prisma";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";

export type SmtpDeliveryConfig = {
  source: "ENV" | "PLATFORM";
  host: string | null;
  port: number | null;
  encryption: string;
  login: string | null;
  password: string | null;
  fromEmail: string | null;
  fromName: string | null;
};

/**
 * Полная конфигурация доставки почты, сохранённая в настройках платформы.
 *
 * Читается одним запросом намеренно: адрес сервера, порт и учётные данные
 * должны происходить из одного снимка настроек. Если собирать их из разных
 * чтений базы, ротация настроек между этими чтениями даёт смесь — например,
 * старый хост с новым паролем, — и отправка падает на аутентификации.
 *
 * Пароля нет в `PlatformSettingsState`: то состояние целиком уезжает в браузер
 * вместе с props клиентской формы настроек (Next сериализует props в RSC
 * payload независимо от того, какие поля читает компонент). Поэтому секрет
 * живёт здесь и запрашивается только серверным кодом — при отправке письма и
 * при проверке SMTP-соединения.
 *
 * Не передавайте результат в компоненты, не возвращайте его из server actions
 * и не логируйте.
 */
export async function getSmtpDeliveryConfig(): Promise<SmtpDeliveryConfig> {
  const record = await prisma.platformSettings.findUnique({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    select: {
      smtpSettingsSource: true,
      smtpHost: true,
      smtpPort: true,
      smtpEncryption: true,
      smtpLogin: true,
      smtpPassword: true,
      smtpFromEmail: true,
      smtpFromName: true,
    },
  });

  return {
    source: record?.smtpSettingsSource === "PLATFORM" ? "PLATFORM" : "ENV",
    host: record?.smtpHost?.trim() || null,
    port: record?.smtpPort ?? DEFAULT_PLATFORM_SETTINGS.smtpPort,
    encryption: record?.smtpEncryption?.trim() || DEFAULT_PLATFORM_SETTINGS.smtpEncryption,
    login: record?.smtpLogin?.trim() || null,
    password: record?.smtpPassword?.trim() || null,
    fromEmail: record?.smtpFromEmail?.trim() || null,
    fromName: record?.smtpFromName?.trim() || null,
  };
}
