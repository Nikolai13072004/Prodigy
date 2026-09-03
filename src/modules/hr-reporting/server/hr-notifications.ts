import "server-only";

import { createManageHrNotifications } from "../application/manage-hr-notifications";
import { prismaHrNotificationRepository } from "../infrastructure/prisma-hr-notification-repository";

export const hrNotifications = createManageHrNotifications({
  repository: prismaHrNotificationRepository,
});
