// Подбор свободного логина при CSV-импорте: если базовый занят — добавляем
// суффикс -2, -3, … , усекая базу до 48 символов с учётом суффикса.
// occupiedLogins мутируется (выбранный логин резервируется).
export function createAvailableLogin(baseLogin: string, occupiedLogins: Set<string>): string {
  if (!occupiedLogins.has(baseLogin)) {
    occupiedLogins.add(baseLogin);
    return baseLogin;
  }

  let attempt = 2;
  while (attempt < 10_000) {
    const suffix = `-${attempt}`;
    const truncatedBase = baseLogin.slice(0, Math.max(1, 48 - suffix.length));
    const candidate = `${truncatedBase}${suffix}`;
    if (!occupiedLogins.has(candidate)) {
      occupiedLogins.add(candidate);
      return candidate;
    }
    attempt += 1;
  }

  throw new Error(`Не удалось подобрать свободный логин для ${baseLogin}.`);
}
