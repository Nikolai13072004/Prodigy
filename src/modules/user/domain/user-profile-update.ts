import { USER_STATUSES, isEditableUserStatus } from "@/lib/users";

// Чистые решения редактирования профиля пользователя (updateUser).
// Вынесены из транспорта: стейт-машина статуса, инвариант «не заблокируй себя», сравнение ролей.

// Стейт-машина статуса.
// Без права смены уровня доступа статус не меняется.
// Режим "activity-toggle": архивного не трогаем; снят чекбокс активности → BLOCKED;
// был BLOCKED и включили → ACTIVE; иначе без изменений.
// Иначе (прямой выбор статуса) — принимается только редактируемый статус.
export function resolveEditedUserStatus(input: {
  canEditAccessLevel: boolean;
  statusControl: string;
  currentStatus: string;
  activeUserChecked: boolean;
  statusRaw: string;
}): string {
  const { canEditAccessLevel, statusControl, currentStatus, activeUserChecked, statusRaw } = input;
  if (!canEditAccessLevel) return currentStatus;

  if (statusControl === "activity-toggle") {
    if (currentStatus === USER_STATUSES.ARCHIVED) return currentStatus;
    if (!activeUserChecked) return USER_STATUSES.BLOCKED;
    if (currentStatus === USER_STATUSES.BLOCKED) return USER_STATUSES.ACTIVE;
    return currentStatus;
  }

  if (isEditableUserStatus(statusRaw)) return statusRaw;
  return currentStatus;
}

// Инвариант: нельзя заблокировать самого себя (перевести свой не-BLOCKED статус в BLOCKED).
export function isSelfBlockAttempt(input: {
  sessionUserId: string;
  targetUserId: string;
  nextStatus: string;
  currentStatus: string;
}): boolean {
  return (
    input.sessionUserId === input.targetUserId &&
    input.nextStatus === USER_STATUSES.BLOCKED &&
    input.currentStatus !== USER_STATUSES.BLOCKED
  );
}

// Набор ролей изменился (по составу, без учёта порядка).
export function haveRolesChanged(currentRoles: string[], nextRoles: string[]): boolean {
  return (
    currentRoles.length !== nextRoles.length ||
    currentRoles.some((role) => !nextRoles.includes(role))
  );
}
