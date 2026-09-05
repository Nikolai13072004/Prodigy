// Чистое правило изменения окна доступа: режим + текущее окно + ввод → новая дата
// (или пропуск). Используется и для одного ученика, и для массового обновления.

export type CourseAccessWindowInput = {
  expiresAt: Date | null;
  isUnlimited: boolean;
} | null;

export type CourseAccessExpiryPlan =
  | { action: "skip"; reason: "NOT_ASSIGNED" | "ALREADY_UNLIMITED" }
  | { action: "set"; expiresAt: Date | null };

export function planCourseAccessExpiry(input: {
  mode: string; // UNLIMITED | EXTEND | SET_DATE
  accessWindow: CourseAccessWindowInput;
  requestedExpiresAt: Date | null; // для SET_DATE, уже провалидированная дата
  days: number; // для EXTEND
  now: Date;
}): CourseAccessExpiryPlan {
  if (!input.accessWindow) {
    return { action: "skip", reason: "NOT_ASSIGNED" };
  }

  // Уже бессрочный — «сделать бессрочным» и «продлить» делать нечего.
  if ((input.mode === "UNLIMITED" || input.mode === "EXTEND") && input.accessWindow.isUnlimited) {
    return { action: "skip", reason: "ALREADY_UNLIMITED" };
  }

  if (input.mode === "UNLIMITED") {
    return { action: "set", expiresAt: null };
  }

  if (input.mode === "SET_DATE") {
    return { action: "set", expiresAt: input.requestedExpiresAt };
  }

  // EXTEND: продлеваем от будущей даты, если она есть, иначе от текущего момента.
  const base =
    input.accessWindow.expiresAt && input.accessWindow.expiresAt.getTime() > input.now.getTime()
      ? input.accessWindow.expiresAt
      : input.now;
  return { action: "set", expiresAt: new Date(base.getTime() + input.days * 24 * 60 * 60 * 1000) };
}
