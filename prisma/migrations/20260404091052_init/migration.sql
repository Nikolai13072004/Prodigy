-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "fileUrl" TEXT,
    CONSTRAINT "Material_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    CONSTRAINT "Quiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "points" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "takerName" TEXT,
    "answers" TEXT NOT NULL,
    "score" INTEGER,
    "maxScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourseFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "employeeName" TEXT,
    "clarityRating" INTEGER NOT NULL,
    "difficultParts" TEXT,
    "usefulParts" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseFeedback_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
