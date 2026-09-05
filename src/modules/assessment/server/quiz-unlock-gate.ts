import "server-only";

import prisma from "@/lib/prisma";
import { canManageCourse } from "@/lib/access";
import { normalizePresentationViewMode } from "@/lib/constants";
import {
  isPublishedSnapshotActive,
  parsePublishedCourseSnapshot,
} from "@/lib/course-content";
import { buildCourseOutline } from "@/lib/course-navigation";
import { canTrackLearningProgress } from "@/lib/roles";

// Проверяет, что доступ к тесту не заблокирован предыдущим обязательным
// материалом. Использует полный outline курса с fallback на published snapshot
// (та же логика, что у loadQuizDeliveryContext). Учителей/владельцев курса
// не проверяем — они видят все элементы.

export type QuizUnlockGateUser = {
  id: string;
  roles: string[];
  permissions?: string[] | null;
};

export type QuizUnlockGateCourse = {
  id: string;
  ownerId: string | null;
  status: string;
  hasUnpublishedChanges: boolean;
  publishedSnapshotJson: string | null;
  navigationMode: string;
  quizGateMode: string;
};

export async function assertQuizUnlockedByRequiredLessons(args: {
  courseId: string;
  quizId: string;
  quizCourseItemId: string;
  user: QuizUnlockGateUser;
  course: QuizUnlockGateCourse;
}) {
  if (!canTrackLearningProgress(args.user.roles, args.user.permissions)) return;

  const publishedSnapshot =
    isPublishedSnapshotActive(args.course) &&
    !canManageCourse(args.user.roles, args.user.id, {
      ownerId: args.course.ownerId,
    })
      ? parsePublishedCourseSnapshot(args.course.publishedSnapshotJson)
      : null;

  const courseItems = await prisma.courseItem.findMany({
    where: publishedSnapshot
      ? {
          id: {
            in: publishedSnapshot.items.map((item) => item.id),
          },
        }
      : { courseId: args.courseId, archivedAt: null },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      moduleId: true,
      orderIndex: true,
      type: true,
      title: true,
      content: true,
      fileUrl: true,
      totalSlides: true,
      presentationViewMode: true,
      isRequired: true,
      module: {
        select: {
          id: true,
          title: true,
          description: true,
          orderIndex: true,
        },
      },
      views: {
        where: { userId: args.user.id },
        select: {
          progressPercent: true,
          viewedAt: true,
        },
        take: 1,
      },
      quiz: {
        select: {
          id: true,
          description: true,
          maxAttempts: true,
          minCorrectAnswers: true,
          timeLimitMinutes: true,
          shuffleQuestions: true,
          shuffleAnswers: true,
          lockMaterialsOnStart: true,
          questions: {
            where: { archivedAt: null },
            select: {
              id: true,
            },
          },
          attempts: {
            where: { userId: args.user.id },
            orderBy: { attemptNumber: "asc" },
            select: {
              id: true,
              outcome: true,
              correctAnswers: true,
              attemptNumber: true,
              score: true,
              maxScore: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });

  const displayCourseItems = publishedSnapshot
    ? publishedSnapshot.items.map((item) => {
        const liveItem = courseItems.find((candidate) => candidate.id === item.id);
        return {
          id: item.id,
          moduleId: item.moduleId,
          orderIndex: item.orderIndex,
          type: item.type,
          title: item.title,
          content: item.content,
          fileUrl: item.fileUrl,
          totalSlides: item.totalSlides,
          presentationViewMode: normalizePresentationViewMode(
            item.presentationViewMode,
          ),
          isRequired: item.isRequired,
          module: item.moduleId
            ? publishedSnapshot.modules.find(
                (module) => module.id === item.moduleId,
              ) ?? null
            : null,
          views: liveItem?.views ?? [],
          quiz: item.quiz
            ? {
                id: item.quiz.id,
                description: item.quiz.description,
                maxAttempts: item.quiz.maxAttempts,
                minCorrectAnswers: item.quiz.minCorrectAnswers,
                lockMaterialsOnStart: item.quiz.lockMaterialsOnStart,
                questions: item.quiz.questions.map((question) => ({
                  id: question.id,
                })),
                attempts: liveItem?.quiz?.attempts ?? [],
              }
            : null,
        };
      })
    : courseItems.map((item) => ({
        ...item,
        quiz: item.quiz ? { ...item.quiz } : null,
      }));

  const navigationMode =
    (publishedSnapshot?.navigationMode ?? args.course.navigationMode) ===
    "SEQUENTIAL"
      ? "SEQUENTIAL"
      : "FREE";
  const quizGateMode =
    (publishedSnapshot?.quizGateMode ?? args.course.quizGateMode) === "PASSED"
      ? "PASSED"
      : "RESOLVED";
  const outline = buildCourseOutline(displayCourseItems, navigationMode, {
    lockQuizzesUntilPreviousRequiredComplete: true,
    quizGateMode,
  });
  const quizEntry =
    outline.find((item) => item.id === args.quizCourseItemId) ?? null;

  if (quizEntry?.isLocked) {
    throw new Error(
      "Тест станет доступен после завершения предыдущего обязательного материала",
    );
  }
}
