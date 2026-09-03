// HR-уведомления: настройки и скрытие/восстановление карточек.
// Тонкий use-case: значения уже распарсены транспортом, здесь — upsert/delete
// через порт. Постановка писем (queueHrNotificationEmailsForUser) и redirect'ы
// остаются на транспорте.

export type HrNotificationPreferencesInput = {
  notifyCourseCompleted: boolean;
  notifyLowActivity: boolean;
  lowActivityDays: number;
  notifyAccessExpiring: boolean;
  accessExpiringDays: number;
};

export type HrNotificationDismissalInput = {
  notificationKey: string;
  type: string;
  courseId: string;
  learnerId: string;
};

export interface HrNotificationRepository {
  upsertPreferences(userId: string, prefs: HrNotificationPreferencesInput): Promise<void>;
  upsertDismissal(userId: string, dismissal: HrNotificationDismissalInput): Promise<void>;
  deleteDismissal(userId: string, notificationKey: string): Promise<void>;
}

export function createManageHrNotifications(deps: { repository: HrNotificationRepository }) {
  const { repository } = deps;

  return {
    async savePreferences(userId: string, prefs: HrNotificationPreferencesInput): Promise<void> {
      await repository.upsertPreferences(userId, prefs);
    },

    async dismiss(userId: string, dismissal: HrNotificationDismissalInput): Promise<void> {
      await repository.upsertDismissal(userId, dismissal);
    },

    async restore(userId: string, notificationKey: string): Promise<void> {
      await repository.deleteDismissal(userId, notificationKey);
    },
  };
}
