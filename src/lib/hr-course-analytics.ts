import { getBestAttempt, getCourseProgress } from "@/lib/course-progress";
import { resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import prisma from "@/lib/prisma";

export type HrCourseAnalyticsStatusFilter = "all" | "published" | "draft";

export type HrCourseSummaryRow = {
  id: string;
  title: string;
  status: string;
  groupName: string;
  assignedLearnersCount: number;
  expiredAccessLearnersCount: number;
  completedLearnersCount: number;
  completedLearnersPercent: number;
  inProgressLearnersCount: number;
  notStartedLearnersCount: number;
  avgProgressPercent: number;
  avgGradePercent: number | null;
  pendingInvitesCount: number;
  updatedAt: Date;
};

export type HrCourseAnalyticsData = {
  rows: HrCourseSummaryRow[];
  monthlyCompletions: Array<{
    monthKey: string;
    label: string;
    count: number;
  }>;
  summary: {
    totalCourses: number;
    publishedCourses: number;
    draftCourses: number;
    coursesWithAssignments: number;
    assignedLearners: number;
    expiredAccessLearners: number;
    completedLearners: number;
    pendingInvites: number;
    avgProgressPercent: number;
    avgGradePercent: number | null;
  };
};

export function getHrCourseAnalyticsStatusFilter(value: string | undefined): HrCourseAnalyticsStatusFilter {
  if (value === "published") return "published";
  if (value === "draft") return "draft";
  return "all";
}

type CourseAssignmentSeed = {
  directAccessByLearnerId: Map<string, Array<Date | null>>;
  groupAccessByLearnerId: Map<string, Array<Date | null>>;
  groupNames: Set<string>;
};

function pushLearnerAccessExpiry(
  accessByLearnerId: Map<string, Array<Date | null>>,
  learnerId: string,
  expiresAt: Date | null
) {
  const values = accessByLearnerId.get(learnerId) ?? [];
  values.push(expiresAt);
  accessByLearnerId.set(learnerId, values);
}

type CourseItemSnapshot = {
  id: string;
  courseId: string;
  type: string;
  isRequired: boolean;
  views: Array<{
    userId: string;
    progressPercent: number;
    viewedAt: Date;
  }>;
  quiz: {
    id: string;
    maxAttempts: number;
    minCorrectAnswers: number;
    attempts: Array<{
      userId: string;
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      maxScore: number;
      completedAt: Date;
    }>;
  } | null;
};

export async function getHrCourseAnalyticsData(args: {
  q?: string;
  statusFilter: HrCourseAnalyticsStatusFilter;
}): Promise<HrCourseAnalyticsData> {
  const q = (args.q ?? "").trim();

  const courses = await prisma.course.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(args.statusFilter === "published"
        ? { status: "PUBLISHED" }
        : args.statusFilter === "draft"
          ? { NOT: { status: "PUBLISHED" } }
          : {}),
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      quizGateMode: true,
      updatedAt: true,
      directAssignments: {
        select: { userId: true, expiresAt: true },
      },
      groupAssignments: {
        select: {
          expiresAt: true,
          group: {
            select: {
              name: true,
              memberships: {
                select: { userId: true },
              },
            },
          },
        },
      },
      invites: {
        where: { status: "PENDING" },
        select: { id: true },
      },
    },
  });

  if (courses.length === 0) {
    return {
      rows: [],
      monthlyCompletions: buildMonthlyCompletionBuckets([]),
      summary: {
        totalCourses: 0,
        publishedCourses: 0,
        draftCourses: 0,
        coursesWithAssignments: 0,
        assignedLearners: 0,
        expiredAccessLearners: 0,
        completedLearners: 0,
        pendingInvites: 0,
        avgProgressPercent: 0,
        avgGradePercent: null,
      },
    };
  }

  const courseIds = courses.map((course) => course.id);
  const courseAssignments = new Map<string, CourseAssignmentSeed>();
  const candidateLearnerIds = new Set<string>();

  for (const course of courses) {
    const seed: CourseAssignmentSeed = {
      directAccessByLearnerId: new Map(),
      groupAccessByLearnerId: new Map(),
      groupNames: new Set<string>(),
    };

    for (const assignment of course.directAssignments) {
      pushLearnerAccessExpiry(seed.directAccessByLearnerId, assignment.userId, assignment.expiresAt);
    }

    for (const groupAssignment of course.groupAssignments) {
      seed.groupNames.add(groupAssignment.group.name);
      for (const membership of groupAssignment.group.memberships) {
        pushLearnerAccessExpiry(
          seed.groupAccessByLearnerId,
          membership.userId,
          groupAssignment.expiresAt
        );
      }
    }

    for (const learnerId of seed.directAccessByLearnerId.keys()) {
      candidateLearnerIds.add(learnerId);
    }
    for (const learnerId of seed.groupAccessByLearnerId.keys()) {
      candidateLearnerIds.add(learnerId);
    }

    courseAssignments.set(course.id, seed);
  }

  const studentLearners = candidateLearnerIds.size
    ? await prisma.user.findMany({
        where: {
          id: { in: Array.from(candidateLearnerIds) },
          OR: [
            { role: "Ученик" },
            {
              userRoles: {
                some: {
                  roleProfile: {
                    name: "Ученик",
                  },
                },
              },
            },
          ],
        },
        select: { id: true },
      })
    : [];

  const studentLearnerIds = new Set(studentLearners.map((learner) => learner.id));

  const courseItems = studentLearnerIds.size
    ? await prisma.courseItem.findMany({
        where: {
          courseId: { in: courseIds },
        },
        orderBy: [{ courseId: "asc" }, { orderIndex: "asc" }],
        select: {
          id: true,
          courseId: true,
          type: true,
          isRequired: true,
          views: {
            where: {
              userId: { in: Array.from(studentLearnerIds) },
            },
            select: {
              userId: true,
              progressPercent: true,
              viewedAt: true,
            },
          },
          quiz: {
            select: {
              id: true,
              maxAttempts: true,
              minCorrectAnswers: true,
              attempts: {
                where: {
                  userId: { in: Array.from(studentLearnerIds) },
                },
                orderBy: [{ userId: "asc" }, { attemptNumber: "asc" }],
                select: {
                  userId: true,
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
      })
    : [];

  const itemsByCourseId = new Map<string, CourseItemSnapshot[]>();
  const materialProgressByUserAndItem = new Map<string, number>();
  const quizAttemptsByUserAndQuiz = new Map<
    string,
    Array<{
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      maxScore: number;
      completedAt: Date;
    }>
  >();

  for (const item of courseItems) {
    const items = itemsByCourseId.get(item.courseId) ?? [];
    items.push(item);
    itemsByCourseId.set(item.courseId, items);

    for (const view of item.views) {
      materialProgressByUserAndItem.set(`${view.userId}:${item.id}`, view.progressPercent);
    }

    if (!item.quiz) continue;
    for (const attempt of item.quiz.attempts) {
      const key = `${attempt.userId}:${item.quiz.id}`;
      const attempts = quizAttemptsByUserAndQuiz.get(key) ?? [];
      attempts.push(attempt);
      quizAttemptsByUserAndQuiz.set(key, attempts);
    }
  }

  let totalAssignedLearners = 0;
  let totalExpiredAccessLearners = 0;
  let totalCompletedLearners = 0;
  let totalPendingInvites = 0;
  let totalProgressSum = 0;
  let totalGradedLearners = 0;
  let totalGradeSum = 0;
  const completionDates: Date[] = [];

  const rows = courses.map((course) => {
    const assignmentSeed = courseAssignments.get(course.id) ?? {
      directAccessByLearnerId: new Map<string, Array<Date | null>>(),
      groupAccessByLearnerId: new Map<string, Array<Date | null>>(),
      groupNames: new Set<string>(),
    };
    const learnerIds: string[] = [];
    let expiredAccessLearnersCount = 0;
    const candidateCourseLearnerIds = new Set<string>([
      ...assignmentSeed.directAccessByLearnerId.keys(),
      ...assignmentSeed.groupAccessByLearnerId.keys(),
    ]);

    for (const learnerId of candidateCourseLearnerIds) {
      if (!studentLearnerIds.has(learnerId)) continue;
      const accessWindow = resolveEffectiveCourseAccessWindow(
        assignmentSeed.directAccessByLearnerId.get(learnerId) ?? [],
        assignmentSeed.groupAccessByLearnerId.get(learnerId) ?? []
      );
      if (!accessWindow) continue;
      if (accessWindow.isActive) learnerIds.push(learnerId);
      else expiredAccessLearnersCount += 1;
    }

    const courseItemsList = itemsByCourseId.get(course.id) ?? [];

    const learnerSnapshots = learnerIds.map((learnerId) => {
      const progress = getCourseProgress({
        quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
        items: courseItemsList.map((item) => ({
          id: item.id,
          type: item.type,
          isRequired: item.isRequired,
          viewed:
            item.type === "QUIZ" ? false : (materialProgressByUserAndItem.get(`${learnerId}:${item.id}`) ?? 0) > 0,
          materialProgress: materialProgressByUserAndItem.get(`${learnerId}:${item.id}`) ?? 0,
          quiz: item.quiz
            ? {
                maxAttempts: item.quiz.maxAttempts,
                minCorrectAnswers: item.quiz.minCorrectAnswers,
                attempts: quizAttemptsByUserAndQuiz.get(`${learnerId}:${item.quiz.id}`) ?? [],
              }
            : null,
        })),
      });

      return {
        progress,
        gradePercent: getLearnerCourseGradePercent(courseItemsList, learnerId, quizAttemptsByUserAndQuiz),
        completedAt: getLearnerCourseCompletedAt(courseItemsList, learnerId, quizAttemptsByUserAndQuiz),
      };
    });

    const assignedLearnersCount = learnerIds.length;
    const completedLearnersCount = learnerSnapshots.filter((item) => item.progress.isCompleted).length;
    const completedLearnersPercent = assignedLearnersCount
      ? Number(((completedLearnersCount / assignedLearnersCount) * 100).toFixed(1))
      : 0;
    const inProgressLearnersCount = learnerSnapshots.filter(
      (item) => item.progress.percent > 0 && !item.progress.isCompleted
    ).length;
    const notStartedLearnersCount = Math.max(
      assignedLearnersCount - completedLearnersCount - inProgressLearnersCount,
      0
    );
    const avgProgressPercent = assignedLearnersCount
      ? Number(
          (
            learnerSnapshots.reduce((sum, item) => sum + item.progress.percent, 0) /
            assignedLearnersCount
          ).toFixed(1)
        )
      : 0;
    const gradedSnapshots = learnerSnapshots.filter((item) => item.gradePercent !== null);
    const avgGradePercent = gradedSnapshots.length
      ? Number(
          (
            gradedSnapshots.reduce((sum, item) => sum + (item.gradePercent ?? 0), 0) /
            gradedSnapshots.length
          ).toFixed(1)
        )
      : null;

    totalAssignedLearners += assignedLearnersCount;
    totalExpiredAccessLearners += expiredAccessLearnersCount;
    totalCompletedLearners += completedLearnersCount;
    totalPendingInvites += course.invites.length;
    totalProgressSum += learnerSnapshots.reduce((sum, item) => sum + item.progress.percent, 0);
    totalGradedLearners += gradedSnapshots.length;
    totalGradeSum += gradedSnapshots.reduce((sum, item) => sum + (item.gradePercent ?? 0), 0);
    for (const snapshot of learnerSnapshots) {
      if (snapshot.progress.isCompleted && snapshot.completedAt) {
        completionDates.push(snapshot.completedAt);
      }
    }

    return {
      id: course.id,
      title: course.title,
      status: course.status,
      groupName:
        assignmentSeed.groupNames.size > 0 ? Array.from(assignmentSeed.groupNames).sort((a, b) => a.localeCompare(b, "ru")).join(", ") : "Не назначен",
      assignedLearnersCount,
      expiredAccessLearnersCount,
      completedLearnersCount,
      completedLearnersPercent,
      inProgressLearnersCount,
      notStartedLearnersCount,
      avgProgressPercent,
      avgGradePercent,
      pendingInvitesCount: course.invites.length,
      updatedAt: course.updatedAt,
    };
  });

  return {
    rows,
    monthlyCompletions: buildMonthlyCompletionBuckets(completionDates),
    summary: {
      totalCourses: rows.length,
      publishedCourses: rows.filter((row) => row.status === "PUBLISHED").length,
      draftCourses: rows.filter((row) => row.status !== "PUBLISHED").length,
      coursesWithAssignments: rows.filter(
        (row) => row.assignedLearnersCount > 0 || row.expiredAccessLearnersCount > 0
      ).length,
      assignedLearners: totalAssignedLearners,
      expiredAccessLearners: totalExpiredAccessLearners,
      completedLearners: totalCompletedLearners,
      pendingInvites: totalPendingInvites,
      avgProgressPercent:
        totalAssignedLearners > 0 ? Number((totalProgressSum / totalAssignedLearners).toFixed(1)) : 0,
      avgGradePercent:
        totalGradedLearners > 0 ? Number((totalGradeSum / totalGradedLearners).toFixed(1)) : null,
    },
  };
}

function getLearnerCourseGradePercent(
  items: CourseItemSnapshot[],
  learnerId: string,
  quizAttemptsByUserAndQuiz: Map<
    string,
    Array<{
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      maxScore: number;
      completedAt: Date;
    }>
  >
) {
  const quizPercents = items.flatMap((item) => {
    if (!item.quiz) return [];
    const attempts = quizAttemptsByUserAndQuiz
      .get(`${learnerId}:${item.quiz.id}`)
      ?.filter((attempt) => attempt.outcome !== "IN_PROGRESS") ?? [];
    const bestAttempt = getBestAttempt(attempts);
    if (!bestAttempt || bestAttempt.maxScore <= 0) return [];
    return [Number(((bestAttempt.score / bestAttempt.maxScore) * 100).toFixed(1))];
  });

  if (quizPercents.length === 0) return null;
  return Number((quizPercents.reduce((sum, value) => sum + value, 0) / quizPercents.length).toFixed(1));
}

function getLearnerCourseCompletedAt(
  items: CourseItemSnapshot[],
  learnerId: string,
  quizAttemptsByUserAndQuiz: Map<
    string,
    Array<{
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      maxScore: number;
      completedAt: Date;
    }>
  >
) {
  const stageDates: Date[] = [];
  const presentationItem = items.find((item) => item.type === "PDF");
  const videoItem = items.find((item) => item.type === "VIDEO");
  const mainQuizItem = items.find((item) => item.type === "QUIZ" && item.quiz);

  if (presentationItem) {
    const completionView = presentationItem.views.find(
      (view) => view.userId === learnerId && view.progressPercent >= 100
    );
    if (!completionView) return null;
    stageDates.push(completionView.viewedAt);
  }

  if (videoItem) {
    const completionView = videoItem.views.find((view) => view.userId === learnerId && view.progressPercent >= 100);
    if (!completionView) return null;
    stageDates.push(completionView.viewedAt);
  }

  if (mainQuizItem?.quiz) {
    const passedAttempt = (quizAttemptsByUserAndQuiz.get(`${learnerId}:${mainQuizItem.quiz.id}`) ?? [])
      .filter((attempt) => attempt.outcome === "PASSED")
      .sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime())[0];
    if (!passedAttempt) return null;
    stageDates.push(passedAttempt.completedAt);
  }

  if (stageDates.length === 0) return null;
  return new Date(Math.max(...stageDates.map((value) => value.getTime())));
}

function buildMonthlyCompletionBuckets(completionDates: Date[]) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const minimumStart = shiftMonth(currentMonthStart, -5);
  const oldestAllowedStart = shiftMonth(currentMonthStart, -11);
  const earliestCompletionMonth = completionDates.length
    ? completionDates
        .map((value) => new Date(value.getFullYear(), value.getMonth(), 1))
        .sort((left, right) => left.getTime() - right.getTime())[0]
    : null;
  const startMonth =
    earliestCompletionMonth && earliestCompletionMonth.getTime() < minimumStart.getTime()
      ? new Date(Math.max(earliestCompletionMonth.getTime(), oldestAllowedStart.getTime()))
      : minimumStart;
  const completionCounts = new Map<string, number>();

  for (const value of completionDates) {
    const monthKey = `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, "0")}`;
    completionCounts.set(monthKey, (completionCounts.get(monthKey) ?? 0) + 1);
  }

  const months: Array<{ monthKey: string; label: string; count: number }> = [];
  for (
    let cursor = new Date(startMonth);
    cursor.getTime() <= currentMonthStart.getTime();
    cursor = shiftMonth(cursor, 1)
  ) {
    const monthKey = `${cursor.getFullYear()}-${`${cursor.getMonth() + 1}`.padStart(2, "0")}`;
    months.push({
      monthKey,
      label: formatMonthLabel(cursor),
      count: completionCounts.get(monthKey) ?? 0,
    });
  }

  return months;
}

function shiftMonth(value: Date, delta: number) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "numeric",
  })
    .format(value)
    .replace(".", "");
}
