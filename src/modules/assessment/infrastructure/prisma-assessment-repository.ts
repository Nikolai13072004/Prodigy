import "server-only";

import prisma from "@/lib/prisma";
import type { AssessmentRepository } from "@/modules/assessment/application/ports";

export const prismaAssessmentRepository: AssessmentRepository = {
  async transact({ quizId, userId, execute }) {
    return prisma.$transaction(async (database) => {
      const attempts = await database.quizAttempt.findMany({
        where: { quizId, userId },
        orderBy: { attemptNumber: "asc" },
      });
      return execute({
        attempts,
        createAttempt(data) {
          return database.quizAttempt.create({ data: { quizId, userId, ...data } });
        },
        updateAttempt(attemptId, data) {
          return database.quizAttempt.update({ where: { id: attemptId }, data });
        },
        async saveBestResult(data) {
          await database.quizUserBestResult.upsert({
            where: { quizId_userId: { quizId, userId } },
            create: { quizId, userId, ...data },
            update: data,
          });
        },
      });
    });
  },
};
