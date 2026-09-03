-- CreateTable
CREATE TABLE "QuizUserBestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bestAttemptId" TEXT,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "bestMaxScore" INTEGER NOT NULL DEFAULT 0,
    "bestCorrectAnswers" INTEGER NOT NULL DEFAULT 0,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuizUserBestResult_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizUserBestResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuizUserBestResult_bestAttemptId_fkey" FOREIGN KEY ("bestAttemptId") REFERENCES "QuizAttempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QuizUserBestResult_bestAttemptId_key" ON "QuizUserBestResult"("bestAttemptId");

-- CreateIndex
CREATE INDEX "QuizUserBestResult_userId_updatedAt_idx" ON "QuizUserBestResult"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuizUserBestResult_quizId_userId_key" ON "QuizUserBestResult"("quizId", "userId");
