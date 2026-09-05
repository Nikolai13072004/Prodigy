import assert from "node:assert/strict";
import { test } from "node:test";
import { createManageHrNotifications } from "./manage-hr-notifications";
import type {
  HrNotificationDismissalInput,
  HrNotificationPreferencesInput,
  HrNotificationRepository,
} from "./manage-hr-notifications";

function makeRepository() {
  const state = {
    prefs: [] as { userId: string; prefs: HrNotificationPreferencesInput }[],
    dismissals: [] as { userId: string; dismissal: HrNotificationDismissalInput }[],
    deletions: [] as { userId: string; key: string }[],
  };
  const repository: HrNotificationRepository = {
    async upsertPreferences(userId, prefs) {
      state.prefs.push({ userId, prefs });
    },
    async upsertDismissal(userId, dismissal) {
      state.dismissals.push({ userId, dismissal });
    },
    async deleteDismissal(userId, key) {
      state.deletions.push({ userId, key });
    },
  };
  return { repository, state };
}

test("savePreferences: пробрасывает значения в репозиторий", async () => {
  const { repository, state } = makeRepository();
  const m = createManageHrNotifications({ repository });
  const prefs: HrNotificationPreferencesInput = {
    notifyCourseCompleted: true,
    notifyLowActivity: false,
    lowActivityDays: 5,
    notifyAccessExpiring: true,
    accessExpiringDays: 14,
  };
  await m.savePreferences("u-1", prefs);
  assert.deepEqual(state.prefs, [{ userId: "u-1", prefs }]);
});

test("dismiss: пробрасывает карточку", async () => {
  const { repository, state } = makeRepository();
  const m = createManageHrNotifications({ repository });
  const dismissal: HrNotificationDismissalInput = {
    notificationKey: "k1",
    type: "LOW_ACTIVITY",
    courseId: "c-1",
    learnerId: "l-1",
  };
  await m.dismiss("u-1", dismissal);
  assert.deepEqual(state.dismissals, [{ userId: "u-1", dismissal }]);
});

test("restore: удаляет по ключу", async () => {
  const { repository, state } = makeRepository();
  const m = createManageHrNotifications({ repository });
  await m.restore("u-1", "k1");
  assert.deepEqual(state.deletions, [{ userId: "u-1", key: "k1" }]);
});
