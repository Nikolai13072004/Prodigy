CREATE TABLE "HrReportSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdById" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "courseId" TEXT,
    "recipientsJson" TEXT NOT NULL,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" DATETIME NOT NULL,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HrReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HrReportSchedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "HrReportScheduleDispatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrReportScheduleDispatch_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "HrReportSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HrReportSchedule_createdById_createdAt_idx" ON "HrReportSchedule"("createdById", "createdAt");
CREATE INDEX "HrReportSchedule_isPaused_nextRunAt_idx" ON "HrReportSchedule"("isPaused", "nextRunAt");
CREATE INDEX "HrReportSchedule_courseId_idx" ON "HrReportSchedule"("courseId");

CREATE UNIQUE INDEX "HrReportScheduleDispatch_scheduleId_periodKey_key" ON "HrReportScheduleDispatch"("scheduleId", "periodKey");
CREATE INDEX "HrReportScheduleDispatch_queuedAt_idx" ON "HrReportScheduleDispatch"("queuedAt");
