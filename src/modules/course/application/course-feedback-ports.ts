// Порты отзывов о курсе (submit / delete / publish-moderation).
// Аудит (delete/publish) пишется в одной транзакции с мутацией (ADR-005).
// submit отзыва аудит не пишет — как и в исходном поведении.

export type CourseFeedbackAudit = {
  actorId: string | null;
  actorLogin: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  objectLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata?: unknown;
};

export type MyFeedbackRecord = {
  id: string;
  rating: number;
  comment: string | null;
  courseTitle: string;
};

export type FeedbackModerationRecord = {
  id: string;
  status: string;
  courseId: string;
  learnerId: string;
  learnerName: string;
  learnerLogin: string;
  courseTitle: string;
};

export type UpsertFeedbackInput = {
  courseId: string;
  userId: string;
  rating: number;
  status: string;
  comment: string | null;
};

export type CourseFeedbackEffects = {
  audit: CourseFeedbackAudit;
};

export interface CourseFeedbackTransaction {
  upsertFeedback(input: UpsertFeedbackInput): Promise<void>;
  deleteFeedback(id: string): Promise<void>;
  publishFeedback(id: string): Promise<void>;
  recordEffects(effects: CourseFeedbackEffects): Promise<void>;
}

export interface CourseFeedbackRepository {
  // Процент завершения курса учеником (для гейта «отзыв только после 100%»).
  // null — курс не найден.
  getCompletionPercent(
    courseId: string,
    userId: string,
  ): Promise<number | null>;
  findMyFeedback(
    courseId: string,
    userId: string,
  ): Promise<MyFeedbackRecord | null>;
  findModeration(
    courseId: string,
    feedbackId: string,
  ): Promise<FeedbackModerationRecord | null>;
  transact<T>(
    execute: (transaction: CourseFeedbackTransaction) => Promise<T>,
  ): Promise<T>;
}
