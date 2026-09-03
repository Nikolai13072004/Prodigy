ALTER TABLE "QuizAttempt" ADD COLUMN "manualReviewJson" TEXT;
ALTER TABLE "QuizAttempt" ADD COLUMN "reviewComment" TEXT;
ALTER TABLE "QuizAttempt" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "QuizAttempt" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "QuizAttempt" ADD COLUMN "reviewedByName" TEXT;
