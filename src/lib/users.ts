export const USER_STATUSES = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  BLOCKED: "BLOCKED",
  ARCHIVED: "ARCHIVED",
} as const;

export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES];

const USER_STATUS_VALUES = Object.values(USER_STATUSES);

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Активен",
  PENDING: "Ожидает подтверждения",
  BLOCKED: "Заблокирован",
  ARCHIVED: "Архивирован",
};

export function isUserStatus(value: string): value is UserStatus {
  return USER_STATUS_VALUES.includes(value as UserStatus);
}

export function isEditableUserStatus(value: string): value is Exclude<UserStatus, "ARCHIVED"> {
  return value === USER_STATUSES.ACTIVE || value === USER_STATUSES.PENDING || value === USER_STATUSES.BLOCKED;
}

export function isAccessRevokedUserStatus(value: string) {
  return value === USER_STATUSES.BLOCKED || value === USER_STATUSES.ARCHIVED;
}
export function buildUserDisplayName(firstName: string, lastName: string | null | undefined) {
  return [firstName.trim(), lastName?.trim()].filter(Boolean).join(" ");
}
