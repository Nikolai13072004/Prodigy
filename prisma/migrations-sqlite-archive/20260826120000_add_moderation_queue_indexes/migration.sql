-- CreateIndex
CREATE INDEX "CourseFeedback_status_createdAt_idx" ON "CourseFeedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QuizAttempt_outcome_completedAt_idx" ON "QuizAttempt"("outcome", "completedAt");
