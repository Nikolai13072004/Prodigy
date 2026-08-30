-- CreateTable
CREATE TABLE "CourseSurveyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseSurveyTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseSurveyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseSurveyQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseSurveyTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseSurveyResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseSurveyResponse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseSurveyTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseSurveyResponse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseSurveyAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "textValue" TEXT,
    CONSTRAINT "CourseSurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "CourseSurveyResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseSurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CourseSurveyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseSurveyTemplate_courseId_key" ON "CourseSurveyTemplate"("courseId");

-- CreateIndex
CREATE INDEX "CourseSurveyQuestion_templateId_orderIndex_idx" ON "CourseSurveyQuestion"("templateId", "orderIndex");

-- CreateIndex
CREATE INDEX "CourseSurveyResponse_courseId_createdAt_idx" ON "CourseSurveyResponse"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseSurveyResponse_userId_createdAt_idx" ON "CourseSurveyResponse"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSurveyResponse_courseId_userId_key" ON "CourseSurveyResponse"("courseId", "userId");

-- CreateIndex
CREATE INDEX "CourseSurveyAnswer_questionId_idx" ON "CourseSurveyAnswer"("questionId");

-- CreateIndex
CREATE INDEX "CourseSurveyAnswer_responseId_idx" ON "CourseSurveyAnswer"("responseId");

