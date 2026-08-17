import type { AssessmentReviewRepository } from "@/modules/assessment/application/review-ports";
import {
  getAssessmentStatus,
  getBestAssessmentAttempt,
} from "@/modules/assessment/domain/assessment";
import {
  finalizeManualAssessmentReview,
  ManualAssessmentReviewError,
  parseAssessmentAnswers,
  parseAssessmentSnapshot,
  type ManualAssessmentReview,
} from "@/modules/assessment/domain/manual-review";

export class AssessmentReviewApplicationError extends Error {
  constructor(
    readonly code: "ATTEMPT_NOT_REVIEWABLE" | "INVALID_REVIEW" | "REVIEW_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "AssessmentReviewApplicationError";
  }
}

export function createReviewAssessmentAttempt(repository: AssessmentReviewRepository) {
  return async function reviewAssessmentAttempt(command: {
    attemptId: string;
    reviewer: { id: string; name: string };
    review: ManualAssessmentReview;
    comment: string | null;
    expectedReviewedAt: Date | null;
    now?: Date;
  }) {
    return repository.transactReview({
      attemptId: command.attemptId,
      execute: async (transaction) => {
        if (transaction.target.outcome === "IN_PROGRESS") {
          throw new AssessmentReviewApplicationError(
            "ATTEMPT_NOT_REVIEWABLE",
            "Незавершённую попытку нельзя проверить.",
          );
        }
        if (
          transaction.target.reviewedAt?.getTime() !== command.expectedReviewedAt?.getTime()
        ) {
          throw new AssessmentReviewApplicationError(
            "REVIEW_CONFLICT",
            "Работу уже изменил другой преподаватель. Обновите страницу и проверьте актуальную оценку.",
          );
        }

        let finalized;
        try {
          finalized = finalizeManualAssessmentReview({
            questions: parseAssessmentSnapshot(transaction.target.questionSnapshot),
            answers: parseAssessmentAnswers(transaction.target.answers),
            review: command.review,
            minCorrectAnswers: transaction.quiz.minCorrectAnswers,
          });
        } catch (error) {
          if (!(error instanceof ManualAssessmentReviewError)) throw error;
          throw new AssessmentReviewApplicationError("INVALID_REVIEW", error.message);
        }

        const reviewedAt = command.now ?? new Date();
        const updated = await transaction.updateTarget({
          score: finalized.score,
          maxScore: finalized.maxScore,
          correctAnswers: finalized.correctAnswers,
          totalQuestions: finalized.totalQuestions,
          outcome: finalized.outcome,
          manualReviewJson: JSON.stringify(command.review),
          reviewComment: command.comment,
          reviewedAt,
          reviewedById: command.reviewer.id,
          reviewedByName: command.reviewer.name,
        });
        const attempts = transaction.attempts.map((attempt) =>
          attempt.id === updated.id ? updated : attempt
        );
        const completed = attempts.filter((attempt) => attempt.outcome !== "IN_PROGRESS");
        const best = getBestAssessmentAttempt(completed);
        const status = getAssessmentStatus({
          attempts,
          bestOutcome: best?.outcome ?? null,
          maxAttempts: transaction.quiz.maxAttempts,
        });
        await transaction.saveBestResult({
          bestAttemptId: best?.id ?? null,
          bestScore: best?.score ?? 0,
          bestMaxScore: best?.maxScore ?? 0,
          bestCorrectAnswers: best?.correctAnswers ?? 0,
          attemptsUsed: completed.length,
          status,
        });

        return {
          attemptId: updated.id,
          previousOutcome: transaction.target.outcome,
          outcome: finalized.outcome,
          score: finalized.score,
          maxScore: finalized.maxScore,
          correctAnswers: finalized.correctAnswers,
          totalQuestions: finalized.totalQuestions,
          reviewedAt,
        };
      },
    });
  };
}
