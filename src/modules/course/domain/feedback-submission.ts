import { COURSE_FEEDBACK_STATUSES } from "@/lib/constants";

// COURSE_FEEDBACK_STATUSES = ["PUBLISHED", "PENDING"].
const [PUBLISHED, PENDING] = COURSE_FEEDBACK_STATUSES;

export function isValidFeedbackRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

// При включённой модерации отзыв уходит на проверку (PENDING), иначе публикуется сразу.
export function resolveFeedbackStatus(moderationEnabled: boolean): string {
  return moderationEnabled ? PENDING : PUBLISHED;
}
