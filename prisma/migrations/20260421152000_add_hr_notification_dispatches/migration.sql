CREATE TABLE "HrNotificationDispatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrNotificationDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HrNotificationDispatch_userId_notificationKey_key" ON "HrNotificationDispatch"("userId", "notificationKey");
CREATE INDEX "HrNotificationDispatch_userId_type_occurredAt_idx" ON "HrNotificationDispatch"("userId", "type", "occurredAt");
