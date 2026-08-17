-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "template" TEXT,
    "payloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailJob_status_nextAttemptAt_idx" ON "EmailJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailJob_createdAt_idx" ON "EmailJob"("createdAt");
