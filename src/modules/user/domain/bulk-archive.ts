import { USER_STATUSES } from "@/lib/users";

// Чистое решение массового архивирования: кого архивируем и был ли пропущен текущий пользователь.
// Правило: нельзя архивировать самого себя и уже архивированных.

export function planBulkArchive(
  users: Array<{ id: string; status: string }>,
  currentUserId: string,
): { skippedCurrentUser: boolean; archiveUserIds: string[] } {
  const skippedCurrentUser = users.some((user) => user.id === currentUserId);
  const archiveUserIds = users
    .filter(
      (user) => user.id !== currentUserId && user.status !== USER_STATUSES.ARCHIVED,
    )
    .map((user) => user.id);
  return { skippedCurrentUser, archiveUserIds };
}
