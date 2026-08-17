import Link from "next/link";
import { redirect } from "next/navigation";
import { assignedCourseWhere } from "@/lib/access";
import { requireSession } from "@/lib/auth-guards";
import { getBestAttempt, getCourseProgress } from "@/lib/course-progress";
import {
  getHrCourseAnalyticsData,
  getHrCourseAnalyticsStatusFilter,
  type HrCourseAnalyticsStatusFilter,
  type HrCourseSummaryRow,
} from "@/lib/hr-course-analytics";
import prisma from "@/lib/prisma";
import { PERMISSIONS, ROLES, hasPermission, isPlatformAdminRole } from "@/lib/roles";

type Props = {
  searchParams: Promise<{ tab?: string; q?: string; status?: string }>;
};

type AdminTab = "overview" | "courses";
type HrTab = "courses";
type UserTab = "my";
type AnalyticsMode = "admin" | "hr" | "user";

type AdminOverviewData = {
  coursesCount: number;
  usersCount: number;
  assignmentsCount: number;
  attemptsCount: number;
  avgResultPercent: number;
  avgFeedback: number;
  latestAttempts: {
    id: string;
    user: string;
    course: string;
    quiz: string;
    scorePercent: number;
    status: string;
    completedAt: Date;
  }[];
  problemCourses: CourseAnalyticsRow[];
  latestFeedback: {
    id: string;
    user: string;
    course: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
  }[];
};

type CourseAnalyticsRow = {
  id: string;
  title: string;
  groupName: string;
  avgResultPercent: number;
  attemptsCount: number;
  failedCount: number;
  avgRating: number | null;
  activityStatus: string;
};

type HrFeedbackFeedItem = {
  id: string;
  courseId: string;
  courseTitle: string;
  learnerName: string;
  learnerLogin: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
};

type UserStatsData = {
  assignedCourses: number;
  completedCourses: number;
  avgResultPercent: number;
  lastActivity: Date | null;
  latestAttempts: {
    id: string;
    course: string;
    quiz: string;
    scorePercent: number;
    status: string;
    completedAt: Date;
  }[];
  courseProgress: {
    id: string;
    title: string;
    percent: number;
    completedRequired: number;
    requiredTotal: number;
    lecturePercent: number;
    quizPercent: number;
  }[];
};

export default async function AnalyticsPage({ searchParams }: Props) {
  const session = await requireSession();
  const canViewReports = hasPermission(
    session.user.roles,
    PERMISSIONS.REPORTS_VIEW,
    session.user.permissions
  );
  if (!canViewReports) redirect("/");

  const isAdmin = isPlatformAdminRole(session.user.roles);
  const canManageAssignments = hasPermission(
    session.user.roles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    session.user.permissions
  );
  const canViewUsers = hasPermission(session.user.roles, PERMISSIONS.USERS_VIEW, session.user.permissions);
  const sp = await searchParams;
  const mode: AnalyticsMode = isAdmin ? "admin" : canManageAssignments || canViewUsers ? "hr" : "user";

  const tab = resolveTab(sp.tab, mode);

  const adminOverviewData = isAdmin && tab === "overview" ? await loadAdminOverviewData() : null;
  const adminCoursesData = isAdmin && tab === "courses" ? await loadAdminCoursesData() : null;
  const hrCoursesData =
    mode === "hr" && tab === "courses"
      ? await getHrCourseAnalyticsData({
          q: sp.q ?? "",
          statusFilter: getHrCourseAnalyticsStatusFilter(sp.status),
        })
      : null;
  const hrFeedbackFeed =
    mode === "hr" && hrCoursesData
      ? await loadHrFeedbackFeed(hrCoursesData.rows.map((row) => row.id))
      : [];
  const userStatsData = mode === "user" ? await loadUserStatsData(session.user.id) : null;

  return (
    <main className="mx-auto max-w-7xl pb-8">
      <div className="rounded-2xl border border-[#dce3ec] bg-white px-6 py-5 shadow-[0_8px_20px_rgba(18,40,70,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1f2f4d]">Аналитика</h1>
            <p className="mt-1 text-sm text-[#6a7891]">
              {mode === "admin"
                ? "Обзор KPI и ключевых сценариев обучения в формате MVP."
                : mode === "hr"
                  ? "Сводка по курсам для HR: сколько учеников обучается, завершило курс, каков средний прогресс и где уже истек доступ."
                  : "Личная статистика по назначенным курсам и результатам проверок знаний."}
            </p>
          </div>
          <span className="rounded-full bg-[#e6f5fb] px-3 py-1 text-xs font-semibold text-[#1a83a8]">
            {mode === "admin" ? "BI Dashboard" : mode === "hr" ? "HR Dashboard" : "Progress"}
          </span>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-[#dce3ec] bg-[#f5f8fc] p-2">
        <nav className="flex flex-wrap gap-2 px-1 py-1">
          {mode === "admin" ? (
            <>
              <TabLink href="/analytics?tab=overview" active={tab === "overview"} label="Обзор" />
              <TabLink href="/analytics?tab=courses" active={tab === "courses"} label="По курсам" />
            </>
          ) : mode === "hr" ? (
            <TabLink href={buildHrAnalyticsHref({})} active={tab === "courses"} label="Сводка по курсам" />
          ) : (
            <TabLink href="/analytics?tab=my" active={tab === "my"} label="Моя статистика" />
          )}
        </nav>
      </section>

      {isAdmin && tab === "overview" && adminOverviewData && (
        <AdminOverviewSection data={adminOverviewData} />
      )}
      {isAdmin && tab === "courses" && adminCoursesData && (
        <AdminCoursesSection rows={adminCoursesData} />
      )}
      {mode === "hr" && hrCoursesData && (
        <HrCoursesSection
          rows={hrCoursesData.rows}
          summary={hrCoursesData.summary}
          monthlyCompletions={hrCoursesData.monthlyCompletions}
          feedbackFeed={hrFeedbackFeed}
          q={sp.q ?? ""}
          statusFilter={getHrCourseAnalyticsStatusFilter(sp.status)}
        />
      )}
      {mode === "user" && userStatsData && <UserStatsSection data={userStatsData} />}
    </main>
  );
}

function resolveTab(value: string | undefined, mode: AnalyticsMode): AdminTab | HrTab | UserTab {
  if (mode === "user") return "my";
  if (mode === "hr") return "courses";
  if (value === "courses") return "courses";
  return "overview";
}

function buildHrAnalyticsHref(args: { q?: string; status?: HrCourseAnalyticsStatusFilter }) {
  const params = new URLSearchParams({ tab: "courses" });
  if (args.q?.trim()) params.set("q", args.q.trim());
  if (args.status && args.status !== "all") params.set("status", args.status);
  return `/analytics?${params.toString()}`;
}

function buildHrCourseLearnersHref(args: {
  courseId: string;
  status?: "all" | "in_progress" | "completed" | "not_started";
  access?: "all" | "active" | "expired";
}) {
  const params = new URLSearchParams();
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.access && args.access !== "all") params.set("access", args.access);
  const query = params.toString();
  return query ? `/courses/${args.courseId}/learners?${query}` : `/courses/${args.courseId}/learners`;
}

async function loadAdminOverviewData(): Promise<AdminOverviewData> {
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

async function loadAdminCoursesData(): Promise<CourseAnalyticsRow[]> {
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

async function loadHrFeedbackFeed(courseIds: string[]): Promise<HrFeedbackFeedItem[]> {
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

async function loadUserStatsData(userId: string): Promise<UserStatsData> {
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

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-white text-[#0f315d] shadow-[inset_0_-3px_0_#0f315d]"
          : "border border-transparent bg-white text-[#5b6b84] hover:border-[#d6deea] hover:bg-[#fafdff]"
      }`}
    >
      {label}
    </Link>
  );
}

function AdminOverviewSection({ data }: { data: AdminOverviewData }) {
  return (
    <section className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Курсов всего" value={String(data.coursesCount)} />
        <MetricCard label="Пользователей" value={String(data.usersCount)} />
        <MetricCard label="Назначений" value={String(data.assignmentsCount)} />
        <MetricCard label="Попыток тестов" value={String(data.attemptsCount)} />
        <MetricCard label="Средний результат" value={`${data.avgResultPercent}%`} />
        <MetricCard label="Средняя оценка обратной связи" value={data.avgFeedback ? data.avgFeedback.toFixed(1) : "—"} />
      </div>

      <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
        <h2 className="text-lg font-semibold text-[#213456]">Последние прохождения</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-[#243652]">
            <thead>
              <tr className="border-b border-[#dce3ec] bg-[#f7f9fc] text-[#60718c]">
                <th className="px-2 py-2 font-medium">Пользователь</th>
                <th className="px-2 py-2 font-medium">Курс</th>
                <th className="px-2 py-2 font-medium">Тест</th>
                <th className="px-2 py-2 font-medium">Результат</th>
                <th className="px-2 py-2 font-medium">Статус</th>
                <th className="px-2 py-2 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {data.latestAttempts.map((item) => (
                <tr key={item.id} className="border-b border-[#edf1f7] last:border-0">
                  <td className="px-2 py-2">{item.user}</td>
                  <td className="px-2 py-2">{item.course}</td>
                  <td className="px-2 py-2">{item.quiz}</td>
                  <td className="px-2 py-2">{item.scorePercent}%</td>
                  <td className="px-2 py-2">{item.status}</td>
                  <td className="px-2 py-2">{item.completedAt.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[#213456]">Проблемные курсы</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-[#243652]">
              <thead>
                <tr className="border-b border-[#dce3ec] bg-[#f7f9fc] text-[#60718c]">
                  <th className="px-2 py-2 font-medium">Курс</th>
                  <th className="px-2 py-2 font-medium">Средний результат</th>
                  <th className="px-2 py-2 font-medium">Средняя оценка</th>
                  <th className="px-2 py-2 font-medium">Неуспешные</th>
                </tr>
              </thead>
              <tbody>
                {data.problemCourses.map((course) => (
                  <tr key={course.id} className="border-b border-[#edf1f7] last:border-0">
                    <td className="px-2 py-2">{course.title}</td>
                    <td className="px-2 py-2">{course.avgResultPercent}%</td>
                    <td className="px-2 py-2">{course.avgRating === null ? "—" : course.avgRating}</td>
                    <td className="px-2 py-2">{course.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[#213456]">Последние отзывы</h2>
          <ul className="mt-4 space-y-3">
            {data.latestFeedback.map((feedback) => (
              <li key={feedback.id} className="rounded-xl border border-[#dce3ec] bg-[#fbfdff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#203451]">{feedback.user}</p>
                    <p className="text-xs text-[#6a7891]">{feedback.course}</p>
                  </div>
                  <span className="rounded-full bg-[#e9f5fb] px-2 py-1 text-xs font-semibold text-[#1a83a8]">
                    {feedback.rating}/5
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#2f3f59]">{feedback.comment || "Комментарий не указан"}</p>
                <p className="mt-2 text-xs text-[#7c8aa3]">{feedback.createdAt.toLocaleString("ru-RU")}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function AdminCoursesSection({ rows }: { rows: CourseAnalyticsRow[] }) {
  return (
    <section className="mt-6 rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
      <h2 className="text-lg font-semibold text-[#213456]">По курсам</h2>
      <p className="mt-1 text-sm text-[#6a7891]">Сводная таблица по каждому курсу и уровню активности.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-[#243652]">
          <thead>
            <tr className="border-b border-[#dce3ec] bg-[#f7f9fc] text-[#60718c]">
              <th className="px-2 py-2 font-medium">Название курса</th>
              <th className="px-2 py-2 font-medium">Группа/направление</th>
              <th className="px-2 py-2 font-medium">Средний результат</th>
              <th className="px-2 py-2 font-medium">Прохождений</th>
              <th className="px-2 py-2 font-medium">Неуспешных</th>
              <th className="px-2 py-2 font-medium">Средняя оценка</th>
              <th className="px-2 py-2 font-medium">Статус активности</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#edf1f7] last:border-0">
                <td className="px-2 py-2">{row.title}</td>
                <td className="px-2 py-2">{row.groupName}</td>
                <td className="px-2 py-2">{row.avgResultPercent}%</td>
                <td className="px-2 py-2">{row.attemptsCount}</td>
                <td className="px-2 py-2">{row.failedCount}</td>
                <td className="px-2 py-2">{row.avgRating === null ? "—" : row.avgRating}</td>
                <td className="px-2 py-2">{row.activityStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HrCoursesSection({
  rows,
  summary,
  monthlyCompletions,
  feedbackFeed,
  q,
  statusFilter,
}: {
  rows: HrCourseSummaryRow[];
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
  monthlyCompletions: Array<{
    monthKey: string;
    label: string;
    count: number;
  }>;
  feedbackFeed: HrFeedbackFeedItem[];
  q: string;
  statusFilter: HrCourseAnalyticsStatusFilter;
}) {
  return (
    <section className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-8">
        <MetricCard label="Курсов в отчете" value={String(summary.totalCourses)} />
        <MetricCard label="Опубликованы" value={String(summary.publishedCourses)} />
        <MetricCard label="С назначениями" value={String(summary.coursesWithAssignments)} />
        <MetricCard label="Всего записано" value={String(summary.assignedLearners)} />
        <MetricCard label="Истек доступ" value={String(summary.expiredAccessLearners)} />
        <MetricCard label="Завершили" value={String(summary.completedLearners)} />
        <MetricCard label="Средний прогресс" value={`${summary.avgProgressPercent}%`} />
        <MetricCard
          label="Средняя оценка"
          value={summary.avgGradePercent === null ? "—" : `${formatPercent(summary.avgGradePercent)}%`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#213456]">Завершения по месяцам</h2>
              <p className="mt-1 text-sm text-[#6a7891]">
                График строится по текущей выборке курсов и показывает, сколько завершений произошло в каждом месяце.
              </p>
            </div>
            <span className="rounded-full bg-[#eef8fc] px-3 py-1 text-xs font-semibold text-[#1a83a8]">
              Последние месяцы
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {monthlyCompletions.map((bucket) => {
              const maxCount = Math.max(...monthlyCompletions.map((item) => item.count), 1);
              const heightPercent = Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 18 : 6);

              return (
                <div
                  key={bucket.monthKey}
                  aria-label={`Завершения ${bucket.label}: ${bucket.count}`}
                  className="rounded-2xl border border-[#dce3ec] bg-[#fbfdff] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-[#7b8ba4]">
                      {bucket.label}
                    </span>
                    <span className="text-sm font-semibold text-[#203451]">{bucket.count}</span>
                  </div>
                  <div className="mt-4 flex h-28 items-end rounded-xl bg-[#f4f8fc] px-4 py-3">
                    <div
                      className="w-full rounded-t-xl bg-[#1a9bc5] transition-all"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[#213456]">Состояние выборки</h2>
          <p className="mt-1 text-sm text-[#6a7891]">
            Быстрый срез по текущему набору курсов: прогресс, завершения и результаты тестов.
          </p>

          <dl className="mt-5 space-y-4">
            <StatsLine label="Курсов в отчете" value={String(summary.totalCourses)} />
            <StatsLine label="Всего записано" value={String(summary.assignedLearners)} />
            <StatsLine
              label="Завершили"
              value={
                summary.assignedLearners > 0
                  ? `${summary.completedLearners} (${formatPercent(
                      (summary.completedLearners / summary.assignedLearners) * 100
                    )}%)`
                  : "0"
              }
            />
            <StatsLine label="Средний прогресс" value={`${formatPercent(summary.avgProgressPercent)}%`} />
            <StatsLine
              label="Средняя оценка"
              value={summary.avgGradePercent === null ? "—" : `${formatPercent(summary.avgGradePercent)}%`}
            />
            <StatsLine label="Инвайты в ожидании" value={String(summary.pendingInvites)} />
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#213456]">Лента отзывов</h2>
            <p className="mt-1 text-sm text-[#6a7891]">
              Последние опубликованные отзывы по курсам из текущей выборки.
            </p>
          </div>
          <span className="rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-semibold text-[#1a83a8]">
            {feedbackFeed.length ? `${feedbackFeed.length} последних` : "Пока пусто"}
          </span>
        </div>

        {feedbackFeed.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-[#d6deea] bg-[#fbfdff] px-5 py-8 text-center text-sm text-[#6a7891]">
            По выбранным курсам еще нет опубликованных отзывов.
          </div>
        ) : (
          <ul className="mt-5 grid gap-3 lg:grid-cols-2">
            {feedbackFeed.map((feedback) => (
              <li key={feedback.id} className="rounded-xl border border-[#dce3ec] bg-[#fbfdff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#203451]">{feedback.learnerName}</p>
                    <p className="mt-0.5 truncate text-xs text-[#6a7891]">
                      {feedback.courseTitle} · {feedback.learnerLogin}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#fff4de] px-2.5 py-1 text-xs font-semibold text-[#9a6700]">
                    {feedback.rating}/5
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-5 text-[#2f3f59]">
                  {feedback.comment || "Комментарий не указан."}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#7c8aa3]">
                  <span>{feedback.createdAt.toLocaleString("ru-RU")}</span>
                  <Link
                    href={`/courses/${feedback.courseId}/learners`}
                    className="font-medium text-[#0f7c9f] hover:underline"
                  >
                    К курсу
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#213456]">Сводка по курсам</h2>
            <p className="mt-1 text-sm text-[#6a7891]">
              По каждому курсу видно, сколько учеников с активным доступом, сколько завершили обучение, каков средний прогресс и как проходят тесты.
            </p>
          </div>
          <div className="rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-semibold text-[#1a83a8]">
            Инвайтов в ожидании: {summary.pendingInvites}
          </div>
        </div>

        <form action="/analytics" className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <input type="hidden" name="tab" value="courses" />
          <label>
            <span className="mb-1 block text-xs text-[#6a7891]">Поиск по курсу</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Название или описание курса"
              className="h-10 w-full rounded-xl border border-[#d6deea] bg-white px-3 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs text-[#6a7891]">Статус</span>
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-10 w-full rounded-xl border border-[#d6deea] bg-white px-3 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
            >
              <option value="all">Все курсы</option>
              <option value="published">Только опубликованные</option>
              <option value="draft">Черновики</option>
            </select>
          </label>

          <button
            type="submit"
            className="h-10 self-end rounded-xl bg-[#0f7c9f] px-4 text-sm font-medium text-white hover:bg-[#0c6986]"
          >
            Применить
          </button>

          <Link
            href={buildHrAnalyticsHref({})}
            className="inline-flex h-10 items-center justify-center self-end rounded-xl border border-[#d6deea] bg-white px-4 text-sm font-medium text-[#203451] hover:bg-[#f7fbfe]"
          >
            Сбросить
          </Link>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-[#243652]">
            <thead>
              <tr className="border-b border-[#dce3ec] bg-[#f7f9fc] text-[#60718c]">
                <th className="px-2 py-2 font-medium">Курс</th>
                <th className="px-2 py-2 font-medium">Статус</th>
                <th className="px-2 py-2 font-medium">Группа/направление</th>
                <th className="px-2 py-2 font-medium">Записано</th>
                <th className="px-2 py-2 font-medium">Истек доступ</th>
                <th className="px-2 py-2 font-medium">Завершили</th>
                <th className="px-2 py-2 font-medium">В обучении</th>
                <th className="px-2 py-2 font-medium">Не начали</th>
                <th className="px-2 py-2 font-medium">Средний прогресс</th>
                <th className="px-2 py-2 font-medium">Средняя оценка</th>
                <th className="px-2 py-2 font-medium">Инвайты</th>
                <th className="px-2 py-2 font-medium">Обновлен</th>
                <th className="px-2 py-2 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#edf1f7] last:border-0">
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, access: "active" })}
                      className="font-medium text-[#203451] hover:text-[#0f7c9f] hover:underline"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        row.status === "PUBLISHED"
                          ? "bg-[#e8f8ef] text-[#18794e]"
                          : "bg-[#fff4de] text-[#9a6700]"
                      }`}
                    >
                      {row.status === "PUBLISHED" ? "Опубликован" : "Черновик"}
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.groupName}</td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, access: "active" })}
                      className="font-medium text-[#203451] hover:text-[#0f7c9f] hover:underline"
                    >
                      {row.assignedLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, access: "expired" })}
                      className="font-medium text-[#203451] hover:text-[#0f7c9f] hover:underline"
                    >
                      {row.expiredAccessLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, status: "completed", access: "active" })}
                      className="font-medium text-[#203451] hover:text-[#0f7c9f] hover:underline"
                    >
                      {row.completedLearnersCount} ({formatPercent(row.completedLearnersPercent)}%)
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, status: "in_progress", access: "active" })}
                      className="font-medium text-[#203451] hover:text-[#0f7c9f] hover:underline"
                    >
                      {row.inProgressLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, status: "not_started", access: "active" })}
                      className="font-medium text-[#203451] hover:text-[#0f7c9f] hover:underline"
                    >
                      {row.notStartedLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <div className="min-w-24">
                      <div className="flex items-center justify-between gap-2">
                        <span>{formatPercent(row.avgProgressPercent)}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-[#dce6f4]">
                        <div
                          className="h-2 rounded-full bg-[#1a9bc5]"
                          style={{ width: `${Math.max(0, Math.min(row.avgProgressPercent, 100))}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {row.avgGradePercent === null ? "—" : `${formatPercent(row.avgGradePercent)}%`}
                  </td>
                  <td className="px-2 py-2">{row.pendingInvitesCount}</td>
                  <td className="px-2 py-2">{row.updatedAt.toLocaleDateString("ru-RU")}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={buildHrCourseLearnersHref({ courseId: row.id, access: "active" })}
                        className="rounded-lg border border-[#d6deea] px-3 py-1.5 text-xs font-medium text-[#203451] hover:bg-[#f7fbfe]"
                      >
                        Ученики
                      </Link>
                      <Link
                        href={`/courses/${row.id}/results`}
                        className="rounded-lg border border-[#d6deea] px-3 py-1.5 text-xs font-medium text-[#203451] hover:bg-[#f7fbfe]"
                      >
                        Результаты
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-2 py-8 text-center text-[#6a7891]">
                    По выбранным фильтрам курсы не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function UserStatsSection({ data }: { data: UserStatsData }) {
  return (
    <section className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Назначено курсов" value={String(data.assignedCourses)} />
        <MetricCard label="Завершено" value={String(data.completedCourses)} />
        <MetricCard label="Средний результат" value={`${data.avgResultPercent}%`} />
        <MetricCard
          label="Последняя активность"
          value={data.lastActivity ? data.lastActivity.toLocaleDateString("ru-RU") : "Нет"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[#213456]">Последние попытки</h2>
          <ul className="mt-4 space-y-3">
            {data.latestAttempts.map((attempt) => (
              <li key={attempt.id} className="rounded-xl border border-[#dce3ec] bg-[#fbfdff] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#203451]">{attempt.quiz}</p>
                    <p className="text-xs text-[#6a7891]">{attempt.course}</p>
                  </div>
                  <span className="rounded-full bg-[#e9f5fb] px-2 py-1 text-xs font-semibold text-[#1a83a8]">
                    {attempt.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-[#2f3f59]">Результат: {attempt.scorePercent}%</div>
                <div className="mt-1 text-xs text-[#7c8aa3]">{attempt.completedAt.toLocaleString("ru-RU")}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#dce3ec] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[#213456]">Текущий прогресс по курсам</h2>
          <ul className="mt-4 space-y-4">
            {data.courseProgress.map((course) => (
              <li key={course.id} className="rounded-xl border border-[#dce3ec] bg-[#fbfdff] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#203451]">{course.title}</p>
                  <span className="text-xs text-[#6a7891]">
                    {course.completedRequired}/{course.requiredTotal}
                  </span>
                </div>
                <div className="mt-2 text-xs text-[#6a7891]">Общий прогресс: {course.percent}%</div>
                <div className="mt-2 h-2 rounded-full bg-[#dce6f4]">
                  <div className="h-2 rounded-full bg-[#1a9bc5]" style={{ width: `${course.percent}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#6a7891]">
                  <div>Лекционный материал: {course.lecturePercent}%</div>
                  <div>Тест: {course.quizPercent}%</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dce3ec] bg-white p-5 shadow-[0_8px_18px_rgba(18,40,70,0.05)]">
      <div className="text-xs font-medium uppercase tracking-wide text-[#6a7891]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-[#203451]">{value}</div>
    </div>
  );
}

function StatsLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#edf1f7] pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-[#6a7891]">{label}</dt>
      <dd className="text-sm font-semibold text-[#203451]">{value}</dd>
    </div>
  );
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
