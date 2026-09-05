import "server-only";

import prisma from "@/lib/prisma";

// Read-фасад для транспорта ручной проверки (reviewQuizAttempt): грузит попытку
// со снапшотом вопросов/ответов, данными ручной проверки и контекстом
// quiz/course/user (для валидации курса, аудита и письма). Мутация — отдельно,
// в reviewAssessmentAttempt. Держим здесь, чтобы транспорт был тонким.
export function loadQuizAttemptForReview(attemptId: string) {
  return prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      quizId: true,
      userId: true,
      attemptNumber: true,
      answers: true,
      questionSnapshot: true,
      outcome: true,
      manualReviewJson: true,
      reviewComment: true,
      reviewedAt: true,
      quiz: {
        select: {
          id: true,
          minCorrectAnswers: true,
          maxAttempts: true,
          courseItem: {
            select: {
              title: true,
              courseId: true,
              course: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          login: true,
          email: true,
          firstName: true,
        },
      },
    },
  });
}
