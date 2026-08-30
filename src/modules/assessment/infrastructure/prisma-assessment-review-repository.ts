import "server-only";

import prisma from "@/lib/prisma";
import {
  AssessmentReviewTargetNotFoundError,
  type AssessmentReviewRepository,
} from "@/modules/assessment/application/review-ports";

export const prismaAssessmentReviewRepository: AssessmentReviewRepository = {
  async transactReview({ attemptId, execute }) {
    return prisma.$transaction(async (database) => {
      const target = await database.quizAttempt.findUnique({
        where: { id: attemptId },
        include: {
          quiz: {
            select: {
              id: true,
              minCorrectAnswers: true,
              maxAttempts: true,
              attempts: { orderBy: { attemptNumber: "asc" } },
            },
          },
        },
      });
      if (!target) throw new AssessmentReviewTargetNotFoundError();

      const { quiz, ...targetAttempt } = target;
      return execute({
        target: targetAttempt,
        quiz,
        attempts: quiz.attempts,
        updateTarget(data) {
          return database.quizAttempt.update({
            where: { id: target.id },
            data,
          });
        },
        async saveBestResult(data) {
          await database.quizUserBestResult.upsert({
            where: { quizId_userId: { quizId: quiz.id, userId: target.userId } },
            create: { quizId: quiz.id, userId: target.userId, ...data },
            update: data,
          });
        },
      });
    });
  },
};
