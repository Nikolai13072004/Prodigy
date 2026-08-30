import type { AssessmentAttempt } from "@/modules/assessment/domain/assessment";

export type AttemptWrite = {
  answers: string;
  questionSnapshot: string;
  score: number;
  maxScore: number;
  correctAnswers: number;
  totalQuestions: number;
  outcome: string;
  securityEventsJson?: string | null;
  completedAt: Date;
};

export type BestResultWrite = {
  bestAttemptId: string | null;
  bestScore: number;
  bestMaxScore: number;
  bestCorrectAnswers: number;
  attemptsUsed: number;
  status: string | null;
};

export interface AssessmentTransaction {
  attempts: AssessmentAttempt[];
  createAttempt(data: AttemptWrite & { attemptNumber: number }): Promise<AssessmentAttempt>;
  updateAttempt(attemptId: string, data: AttemptWrite): Promise<AssessmentAttempt>;
  saveBestResult(data: BestResultWrite): Promise<void>;
}

export interface AssessmentRepository {
  transact<T>(args: {
    quizId: string;
    userId: string;
    execute(transaction: AssessmentTransaction): Promise<T>;
  }): Promise<T>;
}
