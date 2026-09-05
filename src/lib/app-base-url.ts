// Базовый публичный URL приложения. Значение фиксируется переменными окружения
// деплоя; фолбэк — локальный dev-порт. Возвращается без завершающего слэша, чтобы
// безопасно конкатенировать (`${appBaseUrl()}/certificates/...`).
export function appBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://127.0.0.1:3002";
  return raw.replace(/\/+$/, "");
}
