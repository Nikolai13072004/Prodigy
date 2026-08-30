import nodemailer from "nodemailer";

export type SmtpAuthType = "password" | "oauth2";

type SmtpTransportBaseConfig = {
  host: string;
  port: number;
  encryption: string;
  user: string;
};

type SmtpPasswordTransportConfig = SmtpTransportBaseConfig & {
  authType?: "password";
  pass: string;
};

type SmtpOAuth2TransportConfig = SmtpTransportBaseConfig & {
  authType: "oauth2";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  accessUrl?: string;
};

export type SmtpOAuth2Credentials = {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  accessToken: string | null;
  accessUrl: string | null;
};

export type SmtpTransportConfig = SmtpPasswordTransportConfig | SmtpOAuth2TransportConfig;

export function createSmtpTransport(config: SmtpTransportConfig) {
  const auth =
    config.authType === "oauth2"
      ? {
          type: "OAuth2" as const,
          user: config.user,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken: config.refreshToken,
          accessToken: config.accessToken,
          accessUrl: config.accessUrl,
        }
      : { user: config.user, pass: config.pass };

  // SMTP_TLS_SERVERNAME: при подключении к почтовому серверу по IP (обход egress-фильтра
  // провайдера через Tailscale) задаёт имя для SNI и проверки TLS-сертификата.
  const tlsServername = process.env.SMTP_TLS_SERVERNAME?.trim();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.encryption === "SSL" || config.port === 465,
    requireTLS: config.encryption === "TLS",
    auth,
    ...(tlsServername ? { tls: { servername: tlsServername } } : {}),
  });
}

export function getSmtpAuthType(value = process.env.SMTP_AUTH_TYPE): SmtpAuthType {
  const normalized = value?.trim().toLowerCase();
  return normalized === "oauth2" || normalized === "xoauth2" ? "oauth2" : "password";
}

export function readSmtpOAuth2CredentialsFromEnv(): SmtpOAuth2Credentials {
  return {
    clientId: readEnv("SMTP_OAUTH_CLIENT_ID"),
    clientSecret: readEnv("SMTP_OAUTH_CLIENT_SECRET"),
    refreshToken: readEnv("SMTP_OAUTH_REFRESH_TOKEN"),
    accessToken: readEnv("SMTP_OAUTH_ACCESS_TOKEN"),
    accessUrl: readEnv("SMTP_OAUTH_ACCESS_URL"),
  };
}

export function hasSmtpOAuth2Credentials(credentials: SmtpOAuth2Credentials) {
  return Boolean(credentials.clientId && credentials.clientSecret && credentials.refreshToken);
}

function readEnv(key: string) {
  const value = process.env[key]?.trim();
  return value || null;
}
