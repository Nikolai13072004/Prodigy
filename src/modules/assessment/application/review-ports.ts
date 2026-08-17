import type {
  AssessmentAttempt,
} from "@/modules/assessment/domain/assessment";
import type { BestResultWrite } from "@/modules/assessment/application/ports";

export type ReviewTargetAttempt = AssessmentAttempt & {
  quizId: string;
  userId: string;
  manualReviewJson: string | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewedByName: string | null;
};

export interface AssessmentReviewTransaction {
  target: ReviewTargetAttempt;
  quiz: {
    id: string;
    minCorrectAnswers: number;
    maxAttempts: number;
  };
  attempts: AssessmentAttempt[];
  updateTarget(data: {
    score: number;
    maxScore: number;
    correctAnswers: number;
    totalQuestions: number;
    outcome: "PASSED" | "FAILED";
    manualReviewJson: string;
    reviewComment: string | null;
    reviewedAt: Date;
    reviewedById: string;
    reviewedByName: string;
  }): Promise<ReviewTargetAttempt>;
  saveBestResult(data: BestResultWrite): Promise<void>;
}

export interface AssessmentReviewRepository {
  transactReview<T>(args: {
    attemptId: string;
    execute(transaction: AssessmentReviewTransaction): Promise<T>;
  }): Promise<T>;
}

export class AssessmentReviewTargetNotFoundError extends Error {
  constructor() {
    super("Работа не найдена.");
    this.name = "AssessmentReviewTargetNotFoundError";
  }
}
