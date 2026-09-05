-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningEvent_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "CourseItemView" ADD COLUMN "viewedPagesJson" TEXT NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "LearningEvent_courseItemId_userId_occurredAt_idx" ON "LearningEvent"("courseItemId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LearningEvent_userId_occurredAt_idx" ON "LearningEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LearningEvent_type_occurredAt_idx" ON "LearningEvent"("type", "occurredAt");
