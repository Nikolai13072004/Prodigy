import { assignedCourseWhere } from "@/lib/access";
import { getBestAttempt, getCourseProgress } from "@/lib/course-progress";
import prisma from "@/lib/prisma";
import { ROLES } from "@/lib/roles";
import type {
  AdminOverviewData,
  CourseAnalyticsRow,
  HrFeedbackFeedItem,
  UserStatsData,
} from "./types";

// Серверные загрузчики данных страницы аналитики + чистые compute-хелперы.
// Вынесены из page.tsx без изменения запросов и логики.

export async function loadAdminOverviewData(): Promise<AdminOverviewData> {
  const [
    coursesCount,
    usersCount,
    directAssignmentsCount,
    groupAssignmentsCount,
    attempts,
    avgFeedbackRaw,
    latestAttemptsRaw,
    coursesRaw,
    latestFeedbackRaw,
  ] = await Promise.all([
    prisma.course.count(),
    prisma.user.count({
      where: {
        OR: [
          { role: ROLES.STUDENT },
          {
            userRoles: {
              some: {
                roleProfile: {
                  name: ROLES.STUDENT,
                },
              },
            },
          },
        ],
      },
    }),
    prisma.courseUserAssignment.count(),
    prisma.courseGroupAssignment.count(),
    prisma.quizAttempt.findMany({
      where: { outcome: { in: ["PASSED", "ATTEMPTED", "FAILED"] } },
      select: {
        id: true,
        score: true,
        maxScore: true,
        correctAnswers: true,
        totalQuestions: true,
        outcome: true,
        completedAt: true,
      },
    }),
    prisma.courseFeedback.aggregate({
      where: { status: "PUBLISHED" },
      _avg: { rating: true },
    }),
    prisma.quizAttempt.findMany({
      where: { outcome: { in: ["PASSED", "ATTEMPTED", "FAILED"] } },
      orderBy: { completedAt: "desc" },
      take: 10,
      include: {
        user: { select: { name: true, login: true } },
        quiz: {
          include: {
            courseItem: {
              include: {
                course: { select: { title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.course.findMany({
      include: {
        groupAssignments: {
          include: {
            group: { select: { name: true } },
          },
        },
        items: {
          include: {
            quiz: {
              include: {
                attempts: {
                  where: { outcome: { in: ["PASSED", "ATTEMPTED", "FAILED"] } },
                },
              },
            },
          },
        },
        feedbacks: {
          where: { status: "PUBLISHED" },
          select: { rating: true },
        },
      },
    }),
    prisma.courseFeedback.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true, login: true } },
        course: { select: { title: true } },
      },
    }),
  ]);

  const avgResultPercent =
    attempts.length === 0
      ? 0
      : Number(
          (
            attempts.reduce((sum, attempt) => sum + toPercent(attempt.score, attempt.maxScore), 0) /
            attempts.length
          ).toFixed(1)
        );

  const latestAttempts = latestAttemptsRaw.map((attempt) => ({
    id: attempt.id,
    user: attempt.user.name || attempt.user.login,
    course: attempt.quiz.courseItem.course.title,
    quiz: attempt.quiz.courseItem.title,
    scorePercent: toPercent(attempt.score, attempt.maxScore),
    status: mapAttemptStatus(attempt.outcome),
    completedAt: attempt.completedAt,
  }));

  const problemCourses = computeCourseAnalyticsRows(coursesRaw)
    .filter((row) => row.failedCount > 0 || (row.avgRating !== null && row.avgRating <= 3.2))
    .sort((left, right) => {
      if (right.failedCount !== left.failedCount) return right.failedCount - left.failedCount;
      return left.avgResultPercent - right.avgResultPercent;
    })
    .slice(0, 8);

  return {
    coursesCount,
    usersCount,
    assignmentsCount: directAssignmentsCount + groupAssignmentsCount,
    attemptsCount: attempts.length,
    avgResultPercent,
    avgFeedback: Number((avgFeedbackRaw._avg.rating ?? 0).toFixed(1)),
    latestAttempts,
    problemCourses,
    latestFeedback: latestFeedbackRaw.map((item) => ({
      id: item.id,
      user: item.user.name || item.user.login,
      course: item.course.title,
      rating: item.rating,
      comment: item.comment,
      createdAt: item.createdAt,
    })),
  };
}

export async function loadAdminCoursesData(): Promise<CourseAnalyticsRow[]> {
  const coursesRaw = await prisma.course.findMany({
    include: {
      groupAssignments: {
        include: {
          group: { select: { name: true } },
        },
      },
      items: {
        include: {
          quiz: {
            include: {
              attempts: {
                where: { outcome: { in: ["PASSED", "ATTEMPTED", "FAILED"] } },
              },
            },
          },
        },
      },
      feedbacks: {
        where: { status: "PUBLISHED" },
        select: { rating: true },
      },
    },
    orderBy: { title: "asc" },
  });

  return computeCourseAnalyticsRows(coursesRaw);
}

export async function loadHrFeedbackFeed(courseIds: string[]): Promise<HrFeedbackFeedItem[]> {
  if (courseIds.length === 0) return [];

  const feedbacks = await prisma.courseFeedback.findMany({
    where: {
      status: "PUBLISHED",
      courseId: { in: courseIds },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      user: {
        select: {
          name: true,
          login: true,
        },
      },
      course: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  return feedbacks.map((feedback) => ({
    id: feedback.id,
    courseId: feedback.course.id,
    courseTitle: feedback.course.title,
    learnerName: feedback.user.name || feedback.user.login,
    learnerLogin: feedback.user.login,
    rating: feedback.rating,
    comment: feedback.comment,
    createdAt: feedback.createdAt,
  }));
}

export async function loadUserStatsData(userId: string): Promise<UserStatsData> {
  const courses = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      ...assignedCourseWhere(userId),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        orderBy: { orderIndex: "asc" },
        include: {
          views: {
            where: { userId },
            select: { progressPercent: true, viewedAt: true },
          },
          quiz: {
            include: {
              attempts: {
                where: { userId, outcome: { in: ["PASSED", "ATTEMPTED", "FAILED"] } },
                orderBy: { completedAt: "desc" },
              },
            },
          },
        },
      },
    },
  });

  const courseProgress = courses.map((course) => {
    const progress = getCourseProgress({
      courseTitle: course.title,
      courseDescription: course.description,
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
      items: course.items.map((item) => ({
        ...item,
        viewed: item.views.length > 0,
        materialProgress: item.views[0]?.progressPercent ?? 0,
      })),
    });
    return {
      id: course.id,
      title: course.title,
      percent: progress.percent,
      completedRequired: progress.completedRequired,
      requiredTotal: progress.requiredTotal,
      lecturePercent: progress.lecture.percent,
      quizPercent: progress.quiz.percent,
      isCompleted: progress.isCompleted,
    };
  });

  const latestAttempts = courses
    .flatMap((course) =>
      course.items
        .filter((item) => item.type === "QUIZ" && item.quiz)
        .flatMap((item) =>
          (item.quiz?.attempts ?? []).map((attempt) => ({
            id: attempt.id,
            course: course.title,
            quiz: item.title,
            scorePercent: toPercent(attempt.score, attempt.maxScore),
            status: mapAttemptStatus(attempt.outcome),
            completedAt: attempt.completedAt,
          }))
        )
    )
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())
    .slice(0, 10);

  const bestResultPercents = courses
    .flatMap((course) =>
      course.items
        .filter((item) => item.type === "QUIZ" && item.quiz)
        .map((item) => getBestAttempt(item.quiz?.attempts ?? []))
        .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt))
        .map((attempt) => toPercent(attempt.score, attempt.maxScore))
    );

  const avgResultPercent =
    bestResultPercents.length === 0
      ? 0
      : Number(
          (
            bestResultPercents.reduce((sum, percent) => sum + percent, 0) / bestResultPercents.length
          ).toFixed(1)
        );

  const lastActivityCandidates = [
    ...latestAttempts.map((attempt) => attempt.completedAt),
    ...courses.flatMap((course) => course.items.flatMap((item) => item.views.map((view) => view.viewedAt))),
  ];
  const lastActivity =
    lastActivityCandidates.length === 0
      ? null
      : new Date(
          Math.max(...lastActivityCandidates.map((dateValue) => dateValue.getTime()))
        );

  return {
    assignedCourses: courses.length,
    completedCourses: courseProgress.filter((course) => course.isCompleted).length,
    avgResultPercent,
    lastActivity,
    latestAttempts,
    courseProgress: courseProgress.map((course) => ({
      id: course.id,
      title: course.title,
      percent: course.percent,
      completedRequired: course.completedRequired,
      requiredTotal: course.requiredTotal,
      lecturePercent: course.lecturePercent,
      quizPercent: course.quizPercent,
    })),
  };
}

function computeCourseAnalyticsRows(
  courses: {
    id: string;
    title: string;
    groupAssignments: { group: { name: string } }[];
    items: { quiz: { attempts: { score: number; maxScore: number; outcome: string }[] } | null }[];
    feedbacks: { rating: number }[];
  }[]
): CourseAnalyticsRow[] {
  return courses.map((course) => {
    const attempts = course.items
      .flatMap((item) => item.quiz?.attempts ?? [])
      .filter((attempt) => attempt.outcome !== "IN_PROGRESS");
    const attemptsCount = attempts.length;
    const failedCount = attempts.filter((attempt) => attempt.outcome !== "PASSED").length;
    const avgResultPercent =
      attemptsCount === 0
        ? 0
        : Number(
            (
              attempts.reduce((sum, attempt) => sum + toPercent(attempt.score, attempt.maxScore), 0) /
              attemptsCount
            ).toFixed(1)
          );
    const avgRating =
      course.feedbacks.length === 0
        ? null
        : Number(
            (
              course.feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0) /
              course.feedbacks.length
            ).toFixed(1)
          );

    return {
      id: course.id,
      title: course.title,
      groupName:
        course.groupAssignments.length > 0
          ? course.groupAssignments.map((item) => item.group.name).join(", ")
          : "Не назначен",
      avgResultPercent,
      attemptsCount,
      failedCount,
      avgRating,
      activityStatus:
        attemptsCount >= 9
          ? "Высокая"
          : attemptsCount >= 4
            ? "Средняя"
            : attemptsCount > 0
              ? "Низкая"
              : "Нет активности",
    };
  });
}

function toPercent(score: number, maxScore: number) {
  if (maxScore <= 0) return 0;
  return Number(((score / maxScore) * 100).toFixed(1));
}

function mapAttemptStatus(outcome: string) {
  if (outcome === "PASSED") return "Сдан";
  if (outcome === "ATTEMPTED") return "Опробован";
  if (outcome === "FAILED") return "Не сдан";
  return "В работе";
}
