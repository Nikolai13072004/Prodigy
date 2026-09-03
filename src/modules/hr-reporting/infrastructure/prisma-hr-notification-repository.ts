import "server-only";

import prisma from "@/lib/prisma";
import type { HrNotificationRepository } from "../application/manage-hr-notifications";

export const prismaHrNotificationRepository: HrNotificationRepository = {
  async upsertPreferences(userId, prefs) {
    await prisma.hrNotificationPreference.upsert({
      where: { userId },
      update: { ...prefs },
      create: { userId, ...prefs },
    });
  },

  async upsertDismissal(userId, dismissal) {
    await prisma.hrNotificationDismissal.upsert({
      where: {
        userId_notificationKey: { userId, notificationKey: dismissal.notificationKey },
      },
      update: {
        dismissedAt: new Date(),
        type: dismissal.type,
        courseId: dismissal.courseId,
        learnerId: dismissal.learnerId,
      },
      create: {
        userId,
        notificationKey: dismissal.notificationKey,
        type: dismissal.type,
        courseId: dismissal.courseId,
        learnerId: dismissal.learnerId,
      },
    });
  },

  async deleteDismissal(userId, notificationKey) {
    await prisma.hrNotificationDismissal.deleteMany({
      where: { userId, notificationKey },
    });
  },
};
