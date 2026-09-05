import "server-only";

import prisma from "@/lib/prisma";
import { canManageCourse } from "@/lib/access";
import { parsePublishedCourseSnapshot } from "@/lib/course-content";

// Read-фасад для delivery-транспорта: собирает quiz с вопросами и попытками
// текущего пользователя, с fallback на publishedSnapshotJson (для учеников,
// когда автор курса ушёл править контент — они видят «замороженные» вопросы).
// Держим здесь, а не в actions.ts: транспорт становится тонким, а read-контракт
// живёт в модуле рядом с delivery use-cases.

export type QuizDeliveryContextUser = {
  id: string;
  roles: string[];
  permissions?: string[] | null;
};

export async function loadQuizDeliveryContext(args: {
  quizId: string;
  courseId: string;
  user: QuizDeliveryContextUser;
}) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: args.quizId },
    include: {
      courseItem: {
        include: {
          course: {
            select: {
              id: true,
              ownerId: true,
              status: true,
              hasUnpublishedChanges: true,
              publishedSnapshotJson: true,
              navigationMode: true,
              quizGateMode: true,
            },
          },
        },
      },
      questions: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
      },
      attempts: {
        where: { userId: args.user.id },
        orderBy: { attemptNumber: "asc" },
      },
    },
  });

  if (!quiz || quiz.courseItem.courseId !== args.courseId) {
    throw new Error("Тест не найден");
  }

  const shouldUsePublishedSnapshot =
    quiz.courseItem.course.status === "PUBLISHED" &&
    quiz.courseItem.course.hasUnpublishedChanges &&
    !canManageCourse(args.user.roles, args.user.id, {
      ownerId: quiz.courseItem.course.ownerId,
    });
  const publishedSnapshot = shouldUsePublishedSnapshot
    ? parsePublishedCourseSnapshot(quiz.courseItem.course.publishedSnapshotJson)
    : null;
  const snapshotItem =
    publishedSnapshot?.items.find((item) => item.quiz?.id === args.quizId) ??
    null;

  return {
    quiz,
    questions: snapshotItem?.quiz?.questions ?? quiz.questions,
    title: snapshotItem?.title ?? quiz.courseItem.title,
    description: snapshotItem?.quiz?.description ?? quiz.description,
    usingPublishedSnapshot: Boolean(snapshotItem),
  };
}
