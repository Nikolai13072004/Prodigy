import prisma from "@/lib/prisma";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";
import {
  createSmtpTransport,
  getSmtpAuthType,
  hasSmtpOAuth2Credentials,
  readSmtpOAuth2CredentialsFromEnv,
  type SmtpAuthType,
} from "@/lib/email/smtp-transport";

export type SmtpConnectionCheckResult = {
  host: string;
  port: number;
  encryption: string;
  login: string;
  authType: SmtpAuthType;
};

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asNullableString(formData: FormData, key: string) {
  const value = asString(formData, key);
  return value || null;
}

function readEnv(key: string) {
  const value = process.env[key]?.trim();
  return value || null;
}

function resolveEnvSmtpEncryption(portRaw: string | null | undefined) {
  const explicitEncryption = readEnv("SMTP_ENCRYPTION");
  if (explicitEncryption) return explicitEncryption.toUpperCase();

  const secure = readEnv("SMTP_SECURE")?.toLowerCase();
  if (secure === "true") return "SSL";
  if (secure === "false") return "TLS";
  if (portRaw === "465") return "SSL";

  return DEFAULT_PLATFORM_SETTINGS.smtpEncryption;
}

function parsePort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP-порт должен быть числом от 1 до 65535.");
  }
  return port;
}

function cleanSmtpErrorMessage(error: unknown, secrets: Array<string | null | undefined>) {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutSecret = secrets.reduce<string>((message, secret) => {
    return secret ? message.split(secret).join("[скрыто]") : message;
  }, raw);
  const normalized = withoutSecret.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 300) || "SMTP-сервер отклонил подключение.";
}

export async function checkSmtpConnectionFromForm(formData: FormData): Promise<SmtpConnectionCheckResult> {
  const source = asString(formData, "smtpSettingsSource") === "PLATFORM" ? "PLATFORM" : "ENV";
  const formEncryption = asString(formData, "smtpEncryption") || DEFAULT_PLATFORM_SETTINGS.smtpEncryption;

  if (!["TLS", "SSL", "NONE"].includes(formEncryption)) {
    throw new Error("Выберите корректный тип шифрования SMTP.");
  }

  const current = await prisma.platformSettings.findUnique({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    select: { smtpPassword: true },
  });

  const passwordFromForm = asString(formData, "smtpPassword");
  const savedPassword = current?.smtpPassword?.trim() || null;
  const envPassword = readEnv("SMTP_PASS");
  const formHost = asNullableString(formData, "smtpHost");
  const envHost = readEnv("SMTP_HOST");
  const formLogin = asNullableString(formData, "smtpLogin");
  const envLogin = readEnv("SMTP_USER");
  const formFrom = asNullableString(formData, "smtpFromEmail");
  const envFrom = readEnv("SMTP_FROM");
  const formPortRaw = asString(formData, "smtpPort");
  const envPortRaw = readEnv("SMTP_PORT");

  const password =
    source === "PLATFORM" ? passwordFromForm || savedPassword || envPassword : envPassword || passwordFromForm || savedPassword;
  const host = source === "PLATFORM" ? formHost || envHost : envHost || formHost;
  const login = source === "PLATFORM" ? formLogin || envLogin : envLogin || formLogin;
  const from = source === "PLATFORM" ? formFrom || envFrom : envFrom || formFrom;
  const portRaw = formPortRaw || envPortRaw;
  const port = parsePort(portRaw || String(DEFAULT_PLATFORM_SETTINGS.smtpPort));
  const smtpEncryption = source === "PLATFORM" ? formEncryption : resolveEnvSmtpEncryption(envPortRaw || portRaw);
  const authType = getSmtpAuthType();
  const oauth2 = readSmtpOAuth2CredentialsFromEnv();

  if (!host || !login || !from) {
    throw new Error("Для проверки заполните SMTP-хост, порт, логин и email отправителя.");
  }

  if (authType === "password" && !password) {
    throw new Error("Для проверки заполните SMTP-пароль или задайте SMTP_PASS.");
  }

  if (authType === "oauth2" && !hasSmtpOAuth2Credentials(oauth2)) {
    throw new Error(
      "Для OAuth2 задайте SMTP_OAUTH_CLIENT_ID, SMTP_OAUTH_CLIENT_SECRET и SMTP_OAUTH_REFRESH_TOKEN в окружении."
    );
  }

  const transporter =
    authType === "oauth2"
      ? createSmtpTransport({
          host,
          port,
          encryption: smtpEncryption,
          user: login,
          authType,
          clientId: oauth2.clientId!,
          clientSecret: oauth2.clientSecret!,
          refreshToken: oauth2.refreshToken!,
          accessToken: oauth2.accessToken ?? undefined,
          accessUrl: oauth2.accessUrl ?? undefined,
        })
      : createSmtpTransport({
          host,
          port,
          encryption: smtpEncryption,
          user: login,
          pass: password!,
        });

  try {
    await transporter.verify();
  } catch (error) {
    throw new Error(
      `Проверка подключения не прошла: ${cleanSmtpErrorMessage(error, [
        password,
        oauth2.clientSecret,
        oauth2.refreshToken,
        oauth2.accessToken,
      ])}`
    );
  } finally {
    transporter.close();
  }

  return {
    host,
    port,
    encryption: smtpEncryption,
    login,
    authType,
  };
}
