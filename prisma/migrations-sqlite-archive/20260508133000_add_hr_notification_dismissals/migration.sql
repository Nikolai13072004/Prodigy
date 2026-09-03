CREATE TABLE "HrNotificationDismissal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "dismissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrNotificationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HrNotificationDismissal_userId_notificationKey_key" ON "HrNotificationDismissal"("userId", "notificationKey");
CREATE INDEX "HrNotificationDismissal_userId_type_dismissedAt_idx" ON "HrNotificationDismissal"("userId", "type", "dismissedAt");
CREATE INDEX "HrNotificationDismissal_learnerId_idx" ON "HrNotificationDismissal"("learnerId");
CREATE INDEX "HrNotificationDismissal_courseId_idx" ON "HrNotificationDismissal"("courseId");
