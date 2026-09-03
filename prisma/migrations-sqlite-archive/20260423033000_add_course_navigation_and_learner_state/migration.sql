ALTER TABLE "Course" ADD COLUMN "navigationMode" TEXT NOT NULL DEFAULT 'FREE';

CREATE TABLE "CourseLearnerState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastOpenedCourseItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseLearnerState_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseLearnerState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseLearnerState_lastOpenedCourseItemId_fkey" FOREIGN KEY ("lastOpenedCourseItemId") REFERENCES "CourseItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CourseLearnerState_courseId_userId_key" ON "CourseLearnerState"("courseId", "userId");
CREATE INDEX "CourseLearnerState_userId_updatedAt_idx" ON "CourseLearnerState"("userId", "updatedAt");
