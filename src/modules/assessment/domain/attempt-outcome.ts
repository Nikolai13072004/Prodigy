export type AttemptStatusCode =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "PASSED"
  | "FAILED";

export function getAttemptOutcomeMeta(args: {
  bestOutcome: string | null;
  attemptsUsed: number;
  maxAttempts: number;
  hasInProgress?: boolean;
  hasPendingReview?: boolean;
}): { code: AttemptStatusCode; label: string } {
  const { bestOutcome, attemptsUsed, maxAttempts, hasInProgress = false, hasPendingReview = false } = args;
  if (bestOutcome === "PASSED") return { code: "PASSED", label: "Пройден" };
  if (hasInProgress) return { code: "IN_PROGRESS", label: "В работе" };
  if (hasPendingReview || bestOutcome === "PENDING_REVIEW") {
    return { code: "PENDING_REVIEW", label: "На проверке" };
  }
  if (!bestOutcome) return { code: "NOT_STARTED", label: "Не начат" };
  if (bestOutcome === "FAILED" || bestOutcome === "ATTEMPTED") {
    return attemptsUsed >= maxAttempts
      ? { code: "FAILED", label: "Не пройден" }
      : { code: "IN_PROGRESS", label: "В работе" };
  }
  if (attemptsUsed >= maxAttempts) return { code: "FAILED", label: "Не пройден" };
  return { code: "IN_PROGRESS", label: "В работе" };
}
