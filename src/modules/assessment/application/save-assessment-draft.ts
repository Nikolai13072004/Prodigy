import type { AssessmentRepository } from "@/modules/assessment/application/ports";
import {
  AssessmentDomainError,
  assertAttemptAvailable,
  assertTimeLimit,
  serializeQuestionSnapshot,
  type AssessmentQuestion,
} from "@/modules/assessment/domain/assessment";
import { AssessmentApplicationError } from "@/modules/assessment/application/errors";

export function createSaveAssessmentDraft(repository: AssessmentRepository) {
  return async function saveAssessmentDraft(command: {
    quizId: string;
    userId: string;
    questions: AssessmentQuestion[];
    answers: Record<string, unknown>;
    maxAttempts: number;
    retryDelayMinutes: number | null;
    timeLimitMinutes: number | null;
    securityEventsJson: string | null;
    now?: Date;
  }) {
    try {
      return await repository.transact({
        quizId: command.quizId,
        userId: command.userId,
        execute: async (transaction) => {
          const now = command.now ?? new Date();
          const completedAttempts = transaction.attempts.filter((attempt) => attempt.outcome !== "IN_PROGRESS");
          const draft = transaction.attempts
            .filter((attempt) => attempt.outcome === "IN_PROGRESS")
            .sort((left, right) => right.attemptNumber - left.attemptNumber)[0] ?? null;
          assertAttemptAvailable({
            completedAttempts,
            maxAttempts: command.maxAttempts,
            retryDelayMinutes: draft ? null : command.retryDelayMinutes,
            now,
          });
          assertTimeLimit({ attempt: draft, timeLimitMinutes: command.timeLimitMinutes, now });

          const write = {
            answers: JSON.stringify(command.answers),
            questionSnapshot: serializeQuestionSnapshot(command.questions),
            score: 0,
            maxScore: command.questions.reduce((sum, question) => sum + Math.max(0, question.points), 0),
            correctAnswers: 0,
            totalQuestions: command.questions.length,
            outcome: "IN_PROGRESS",
            securityEventsJson: command.securityEventsJson,
            completedAt: draft?.completedAt ?? now,
          };
          const attempt = draft
            ? await transaction.updateAttempt(draft.id, write)
            : await transaction.createAttempt({ ...write, attemptNumber: completedAttempts.length + 1 });
          return { attemptId: attempt.id, saved: true };
        },
      });
    } catch (error) {
      if (!(error instanceof AssessmentDomainError)) throw error;
      throw new AssessmentApplicationError(error.code, error.message);
    }
  };
}
