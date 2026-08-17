-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 10,
    "availableAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "claimedAt" DATETIME,
    "processedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_claimedAt_idx" ON "OutboxEvent"("status", "claimedAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_createdAt_idx" ON "OutboxEvent"("createdAt");
