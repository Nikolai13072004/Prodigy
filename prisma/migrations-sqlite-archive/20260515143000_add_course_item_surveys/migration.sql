-- CreateTable
CREATE TABLE "CourseItemSurveyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "courseItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "introImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseItemSurveyTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseItemSurveyTemplate_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseItemSurveyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "optionsJson" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseItemSurveyQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseItemSurveyTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseItemSurveyResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseItemSurveyResponse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseItemSurveyTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseItemSurveyResponse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseItemSurveyResponse_courseItemId_fkey" FOREIGN KEY ("courseItemId") REFERENCES "CourseItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseItemSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseItemSurveyAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "textValue" TEXT,
    CONSTRAINT "CourseItemSurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "CourseItemSurveyResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseItemSurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CourseItemSurveyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseItemSurveyTemplate_courseItemId_key" ON "CourseItemSurveyTemplate"("courseItemId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyTemplate_courseId_idx" ON "CourseItemSurveyTemplate"("courseId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyQuestion_templateId_orderIndex_idx" ON "CourseItemSurveyQuestion"("templateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CourseItemSurveyResponse_courseItemId_userId_key" ON "CourseItemSurveyResponse"("courseItemId", "userId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyResponse_courseId_createdAt_idx" ON "CourseItemSurveyResponse"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseItemSurveyResponse_userId_createdAt_idx" ON "CourseItemSurveyResponse"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseItemSurveyAnswer_questionId_idx" ON "CourseItemSurveyAnswer"("questionId");

-- CreateIndex
CREATE INDEX "CourseItemSurveyAnswer_responseId_idx" ON "CourseItemSurveyAnswer"("responseId");
