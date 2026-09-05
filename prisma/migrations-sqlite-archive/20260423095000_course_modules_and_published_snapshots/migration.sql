-- AlterTable
ALTER TABLE "Question" ADD COLUMN "archivedAt" DATETIME;

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "targetAudience" TEXT,
    "category" TEXT,
    "difficultyLevel" TEXT,
    "durationMinutes" INTEGER,
    "coverUrl" TEXT,
    "navigationMode" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "resultViewMode" TEXT NOT NULL DEFAULT 'SCORE_ONLY',
    "publishedSnapshotJson" TEXT,
    "hasUnpublishedChanges" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Course" ("category", "coverUrl", "createdAt", "description", "difficultyLevel", "durationMinutes", "id", "navigationMode", "ownerId", "publishedAt", "requirements", "resultViewMode", "status", "targetAudience", "title", "updatedAt") SELECT "category", "coverUrl", "createdAt", "description", "difficultyLevel", "durationMinutes", "id", "navigationMode", "ownerId", "publishedAt", "requirements", "resultViewMode", "status", "targetAudience", "title", "updatedAt" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE TABLE "new_CourseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "totalSlides" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CourseItem" ("content", "courseId", "createdAt", "fileUrl", "id", "isRequired", "orderIndex", "title", "totalSlides", "type", "updatedAt") SELECT "content", "courseId", "createdAt", "fileUrl", "id", "isRequired", "orderIndex", "title", "totalSlides", "type", "updatedAt" FROM "CourseItem";
DROP TABLE "CourseItem";
ALTER TABLE "new_CourseItem" RENAME TO "CourseItem";
CREATE INDEX "CourseItem_courseId_orderIndex_idx" ON "CourseItem"("courseId", "orderIndex");
CREATE INDEX "CourseItem_moduleId_idx" ON "CourseItem"("moduleId");
CREATE INDEX "CourseItem_courseId_archivedAt_orderIndex_idx" ON "CourseItem"("courseId", "archivedAt", "orderIndex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CourseModule_courseId_orderIndex_idx" ON "CourseModule"("courseId", "orderIndex");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_archivedAt_orderIndex_idx" ON "CourseModule"("courseId", "archivedAt", "orderIndex");

-- CreateIndex
CREATE INDEX "Question_quizId_archivedAt_orderIndex_idx" ON "Question"("quizId", "archivedAt", "orderIndex");

