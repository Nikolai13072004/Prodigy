CREATE TABLE "CourseReminderDispatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseReminderDispatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseReminderDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CourseReminderDispatch_type_courseId_userId_periodKey_key" ON "CourseReminderDispatch"("type", "courseId", "userId", "periodKey");
CREATE INDEX "CourseReminderDispatch_type_queuedAt_idx" ON "CourseReminderDispatch"("type", "queuedAt");
CREATE INDEX "CourseReminderDispatch_userId_queuedAt_idx" ON "CourseReminderDispatch"("userId", "queuedAt");
