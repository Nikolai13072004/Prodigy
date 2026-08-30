CREATE TABLE "AuditLogEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorLogin" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "objectLabel" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AuditLogEvent_createdAt_idx" ON "AuditLogEvent"("createdAt");
CREATE INDEX "AuditLogEvent_actorId_createdAt_idx" ON "AuditLogEvent"("actorId", "createdAt");
CREATE INDEX "AuditLogEvent_action_createdAt_idx" ON "AuditLogEvent"("action", "createdAt");
CREATE INDEX "AuditLogEvent_objectType_objectId_idx" ON "AuditLogEvent"("objectType", "objectId");

ALTER TABLE "PlatformSettings" ADD COLUMN "auditLogRetentionDays" INTEGER NOT NULL DEFAULT 180;
