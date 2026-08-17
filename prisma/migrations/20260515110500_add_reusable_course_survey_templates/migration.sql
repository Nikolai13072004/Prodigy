-- CreateTable
CREATE TABLE "ReusableCourseSurveyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sourceCourseId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReusableCourseSurveyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReusableCourseSurveyQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReusableCourseSurveyTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyTemplate_createdAt_idx" ON "ReusableCourseSurveyTemplate"("createdAt");

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyTemplate_sourceCourseId_idx" ON "ReusableCourseSurveyTemplate"("sourceCourseId");

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyTemplate_createdById_idx" ON "ReusableCourseSurveyTemplate"("createdById");

-- CreateIndex
CREATE INDEX "ReusableCourseSurveyQuestion_templateId_orderIndex_idx" ON "ReusableCourseSurveyQuestion"("templateId", "orderIndex");
