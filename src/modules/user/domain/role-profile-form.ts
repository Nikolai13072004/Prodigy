import type { Permission } from "@/lib/roles";

// Чистая валидация формы роли (общая для создания и обновления) + инвариант системной роли.

export function validateRolePermissionsForm(name: string, permissions: Permission[]): string | null {
  if (!name) return "Название роли обязательно";
  if (permissions.length === 0) return "Выберите хотя бы один доступ";
  return null;
}

// Системные роли переименовывать нельзя.
export function isSystemRoleRenameAttempt(
  current: { name: string; isSystem: boolean },
  nextName: string,
): boolean {
  return current.isSystem && nextName !== current.name;
}
