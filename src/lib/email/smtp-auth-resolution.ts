export type SmtpCredentialPair = {
  login: string | null;
  password: string | null;
};

/**
 * Выбирает логин и пароль SMTP между сохранёнными настройками платформы и
 * переменными окружения.
 *
 * Логин и пароль каждого источника передаются парой намеренно: они должны
 * происходить из одного снимка настроек. Если брать логин из одного чтения
 * базы, а пароль из другого, ротация обоих значений между этими чтениями даёт
 * логин от старой записи с паролем от новой — и отправка падает на
 * аутентификации.
 */
export function resolveSmtpAuth(args: {
  usePlatformSettings: boolean;
  platform: SmtpCredentialPair;
  env: SmtpCredentialPair;
}): { user: string | null; pass: string | null } {
  const { usePlatformSettings, platform, env } = args;
  const [preferred, fallback] = usePlatformSettings ? [platform, env] : [env, platform];

  return {
    user: preferred.login || fallback.login || null,
    pass: preferred.password || fallback.password || null,
  };
}
