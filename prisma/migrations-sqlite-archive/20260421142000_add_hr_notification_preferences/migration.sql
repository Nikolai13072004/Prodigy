CREATE TABLE "HrNotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notifyCourseCompleted" BOOLEAN NOT NULL DEFAULT true,
    "notifyLowActivity" BOOLEAN NOT NULL DEFAULT true,
    "lowActivityDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HrNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HrNotificationPreference_userId_key" ON "HrNotificationPreference"("userId");
