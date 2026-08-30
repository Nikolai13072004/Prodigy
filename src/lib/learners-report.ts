import { resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import { getCourseProgress, getQuizProgress } from "@/lib/course-progress";
import prisma from "@/lib/prisma";
import { ROLES } from "@/lib/roles";
import { USER_STATUSES, USER_STATUS_LABELS, isUserStatus } from "@/lib/users";
import { buildXlsxWorkbook } from "@/lib/xlsx";

export type LearnerReportStatus =
  | "all"
  | "with_assignments"
  | "in_progress"
  | "completed"
  | "not_started"
  | "no_assignments"
  | "blocked";

export type LearnerReportSort = "name_asc" | "name_desc";
export type LearnerReportUserStatus = "active" | "blocked" | "all";

type CourseAssignmentSeed = {
  assignedAtCandidates: Date[];
  directExpiresAtCandidates: Array<Date | null>;
  inheritedExpiresAtCandidates: Array<Date | null>;
};

export type LearnerReportRow = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  accountStatus: string;
  accountStatusLabel: string;
  department: string;
  groups: string[];
  createdAt: Date;
  assignedCourseIds: string[];
  assignedCourseTitles: string[];
  assignedCoursesCount: number;
  completedCoursesCount: number;
  failedCoursesCount: number;
  inProgressCoursesCount: number;
  notStartedCoursesCount: number;
  overdueCoursesCount: number;
  learningPercent: number;
  averageProgressPercent: number;
  lastLoginAt: Date | null;
  lastAssignedAt: Date | null;
  statusCode: Exclude<LearnerReportStatus, "all" | "with_assignments">;
  statusLabel: string;
};

export type LearnersReportData = {
  rows: LearnerReportRow[];
  filteredRows: LearnerReportRow[];
  summary: {
    total: number;
    withAssignments: number;
    inProgress: number;
    completed: number;
    failed: number;
    notStarted: number;
    overdue: number;
    noAssignments: number;
    blocked: number;
    pendingInvites: number;
  };
};

export type LearnersReportFilters = {
  q?: string;
  statusFilter: LearnerReportStatus;
  sort: LearnerReportSort;
  userStatusFilter?: LearnerReportUserStatus;
  courseId?: string;
  assignedRange?: string;
  groupId?: string;
  departmentId?: string;
  registeredFrom?: string;
  registeredTo?: string;
};

export async function getLearnersReportData(args: {
  q?: string;
  statusFilter: LearnerReportStatus;
  sort?: LearnerReportSort;
  userStatusFilter?: LearnerReportUserStatus;
  courseId?: string;
  assignedRange?: string;
  groupId?: string;
  departmentId?: string;
  registeredFrom?: string;
  registeredTo?: string;
}): Promise<LearnersReportData> {
  const q = (args.q ?? "").trim().toLowerCase();
  const registeredFrom = parseDateStart(args.registeredFrom);
  const registeredTo = parseDateEnd(args.registeredTo);
  const assignedSince = parseAssignedSince(args.assignedRange);
  const sort = args.sort ?? "name_asc";
  const userStatusFilter = args.statusFilter === "blocked" ? "blocked" : (args.userStatusFilter ?? "active");

  const learners = await prisma.user.findMany({
    where: {
      status: getUserStatusWhere(userStatusFilter),
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
      ...(args.groupId
        ? {
            groupMemberships: {
              some: {
                groupId: args.groupId,
              },
            },
          }
        : {}),
      ...(args.departmentId ? { departmentId: args.departmentId } : {}),
      ...(registeredFrom || registeredTo
        ? {
            createdAt: {
              ...(registeredFrom ? { gte: registeredFrom } : {}),
              ...(registeredTo ? { lte: registeredTo } : {}),
            },
          }
        : {}),
    },
    orderBy: { name: sort === "name_desc" ? "desc" : "asc" },
    select: {
      id: true,
      name: true,
      login: true,
      email: true,
      status: true,
      createdAt: true,
      department: {
        select: { name: true },
      },
      groupMemberships: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      loginEvents: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const learnerIds = learners.map((learner) => learner.id);
  const pendingInvites = await prisma.courseInvite.count({ where: { status: "PENDING" } });

  if (learnerIds.length === 0) {
    return {
      rows: [],
      filteredRows: [],
      summary: {
        total: 0,
        withAssignments: 0,
        inProgress: 0,
        completed: 0,
        failed: 0,
        notStarted: 0,
        overdue: 0,
        noAssignments: 0,
        blocked: 0,
        pendingInvites,
      },
    };
  }

  const [directAssignments, groupAssignments] = await Promise.all([
    prisma.courseUserAssignment.findMany({
      where: {
        userId: { in: learnerIds },
        course: { status: "PUBLISHED" },
      },
      select: {
        userId: true,
        courseId: true,
        assignedAt: true,
        expiresAt: true,
        course: {
          select: {
            id: true,
            title: true,
            quizGateMode: true,
          },
        },
      },
    }),
    prisma.courseGroupAssignment.findMany({
      where: {
        course: { status: "PUBLISHED" },
        group: {
          memberships: {
            some: {
              userId: { in: learnerIds },
            },
          },
        },
      },
      select: {
        courseId: true,
        assignedAt: true,
        expiresAt: true,
        course: {
          select: {
            id: true,
            title: true,
            quizGateMode: true,
          },
        },
        group: {
          select: {
            memberships: {
              where: {
                userId: { in: learnerIds },
              },
              select: {
                userId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const coursesById = new Map<string, { id: string; title: string; quizGateMode: string }>();
  const userCourseAssignments = new Map<string, Map<string, CourseAssignmentSeed>>();

  for (const assignment of directAssignments) {
    coursesById.set(assignment.course.id, assignment.course);
    const perUser = userCourseAssignments.get(assignment.userId) ?? new Map<string, CourseAssignmentSeed>();
    const seed = perUser.get(assignment.courseId) ?? createCourseAssignmentSeed();
    seed.assignedAtCandidates.push(assignment.assignedAt);
    seed.directExpiresAtCandidates.push(assignment.expiresAt);
    perUser.set(assignment.courseId, seed);
    userCourseAssignments.set(assignment.userId, perUser);
  }

  for (const assignment of groupAssignments) {
    coursesById.set(assignment.course.id, assignment.course);
    for (const membership of assignment.group.memberships) {
      const perUser = userCourseAssignments.get(membership.userId) ?? new Map<string, CourseAssignmentSeed>();
      const seed = perUser.get(assignment.courseId) ?? createCourseAssignmentSeed();
      seed.assignedAtCandidates.push(assignment.assignedAt);
      seed.inheritedExpiresAtCandidates.push(assignment.expiresAt);
      perUser.set(assignment.courseId, seed);
      userCourseAssignments.set(membership.userId, perUser);
    }
  }

  const courseIds = Array.from(coursesById.keys());
  const courseItems = courseIds.length
    ? await prisma.courseItem.findMany({
        where: {
          courseId: { in: courseIds },
        },
        orderBy: [{ courseId: "asc" }, { orderIndex: "asc" }],
        include: {
          views: {
            where: {
              userId: { in: learnerIds },
            },
            select: {
              userId: true,
              progressPercent: true,
            },
          },
          quiz: {
            select: {
              id: true,
              maxAttempts: true,
              minCorrectAnswers: true,
              attempts: {
                where: {
                  userId: { in: learnerIds },
                },
                orderBy: { attemptNumber: "asc" },
                select: {
                  userId: true,
                  outcome: true,
                  correctAnswers: true,
                  attemptNumber: true,
                  score: true,
                  completedAt: true,
                },
              },
            },
          },
        },
      })
    : [];

  const itemsByCourseId = new Map<string, typeof courseItems>();
  const materialProgressByUserAndItem = new Map<string, number>();
  const quizAttemptsByUserAndQuiz = new Map<
    string,
    Array<{
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      completedAt: Date;
    }>
  >();

  for (const item of courseItems) {
    const courseItemsList = itemsByCourseId.get(item.courseId) ?? [];
    courseItemsList.push(item);
    itemsByCourseId.set(item.courseId, courseItemsList);

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

  const rows = learners
    .map((learner) => {
      const assignedCourseMap = userCourseAssignments.get(learner.id) ?? new Map<string, CourseAssignmentSeed>();
      const assignedCourseIds = Array.from(assignedCourseMap.keys()).sort((left, right) => {
        const leftTitle = coursesById.get(left)?.title ?? "";
        const rightTitle = coursesById.get(right)?.title ?? "";
        return leftTitle.localeCompare(rightTitle, "ru");
      });
      const assignedCourseTitles = assignedCourseIds.map((courseId) => coursesById.get(courseId)?.title ?? courseId);
      const assignedCoursesCount = assignedCourseIds.length;

      const courseSnapshots = assignedCourseIds.map((courseId) => {
        const items = itemsByCourseId.get(courseId) ?? [];
        const course = coursesById.get(courseId) ?? null;
        const progress = getCourseProgress({
          quizGateMode: course?.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
          items: items.map((item) => {
            const materialProgress = materialProgressByUserAndItem.get(`${learner.id}:${item.id}`) ?? 0;
            return {
              id: item.id,
              type: item.type,
              isRequired: item.isRequired,
              viewed: item.type === "QUIZ" ? false : materialProgress > 0,
              materialProgress,
              quiz: item.quiz
                ? {
                    maxAttempts: item.quiz.maxAttempts,
                    minCorrectAnswers: item.quiz.minCorrectAnswers,
                    attempts: quizAttemptsByUserAndQuiz.get(`${learner.id}:${item.quiz.id}`) ?? [],
                  }
                : null,
            };
          }),
        });
        const assignmentSeed = assignedCourseMap.get(courseId);
        const accessWindow = resolveEffectiveCourseAccessWindow(
          assignmentSeed?.directExpiresAtCandidates ?? [],
          assignmentSeed?.inheritedExpiresAtCandidates ?? []
        );

        return {
          progress,
          isFailed: !progress.isCompleted && hasFailedRequiredQuiz(items, learner.id, quizAttemptsByUserAndQuiz),
          isOverdue: !progress.isCompleted && accessWindow?.state === "expired",
        };
      });

      const completedCoursesCount = courseSnapshots.filter((snapshot) => snapshot.progress.isCompleted).length;
      const startedUncompletedCoursesCount = courseSnapshots.filter(
        (snapshot) => snapshot.progress.percent > 0 && !snapshot.progress.isCompleted
      ).length;
      const failedCoursesCount = courseSnapshots.filter(
        (snapshot) => snapshot.isFailed && !snapshot.progress.isCompleted
      ).length;
      const overdueCoursesCount = courseSnapshots.filter(
        (snapshot) => snapshot.isOverdue && !snapshot.isFailed && !snapshot.progress.isCompleted
      ).length;
      const inProgressCoursesCount = courseSnapshots.filter(
        (snapshot) =>
          snapshot.progress.percent > 0 &&
          !snapshot.progress.isCompleted &&
          !snapshot.isFailed &&
          !snapshot.isOverdue
      ).length;
      const notStartedCoursesCount = Math.max(
        assignedCoursesCount - completedCoursesCount - failedCoursesCount - overdueCoursesCount - inProgressCoursesCount,
        0
      );
      const averageProgressPercent = assignedCoursesCount
        ? Math.round(
            courseSnapshots.reduce((sum, snapshot) => sum + snapshot.progress.percent, 0) / assignedCoursesCount
          )
        : 0;
      const learningPercent = assignedCoursesCount
        ? Math.round((completedCoursesCount / assignedCoursesCount) * 1000) / 10
        : 0;
      const lastAssignedAt = Array.from(assignedCourseMap.values()).reduce<Date | null>((latest, seed) => {
        const seedLatest = seed.assignedAtCandidates.reduce<Date | null>(
          (acc, value) => (!acc || value.getTime() > acc.getTime() ? value : acc),
          null
        );
        if (!seedLatest) return latest;
        return !latest || seedLatest.getTime() > latest.getTime() ? seedLatest : latest;
      }, null);
      const statusCode = getLearnerStatusCode({
        assignedCoursesCount,
        completedCoursesCount,
        inProgressCoursesCount: startedUncompletedCoursesCount,
      });
      const groups = learner.groupMemberships
        .map((membership) => membership.group.name)
        .sort((left, right) => left.localeCompare(right, "ru"));

      return {
        id: learner.id,
        name: learner.name,
        login: learner.login,
        email: learner.email,
        accountStatus: learner.status,
        accountStatusLabel: getUserStatusLabel(learner.status),
        department: learner.department?.name ?? "Без подразделения",
        groups,
        assignedCourseIds,
        assignedCourseTitles,
        assignedCoursesCount,
        completedCoursesCount,
        failedCoursesCount,
        inProgressCoursesCount,
        notStartedCoursesCount,
        overdueCoursesCount,
        learningPercent,
        averageProgressPercent,
        lastLoginAt: learner.loginEvents[0]?.createdAt ?? null,
        lastAssignedAt,
        createdAt: learner.createdAt,
        statusCode,
        statusLabel: getLearnerStatusLabel(statusCode),
      };
    })
    .sort((left, right) => compareLearnerNames(left.name, right.name, sort));

  const filteredRows = rows.filter((row) => {
    const matchesStatus =
      args.statusFilter === "all"
        ? true
        : args.statusFilter === "blocked"
          ? row.accountStatus === USER_STATUSES.BLOCKED
        : args.statusFilter === "with_assignments"
          ? row.assignedCoursesCount > 0
          : row.statusCode === args.statusFilter;
    const matchesCourse = !args.courseId || row.assignedCourseIds.includes(args.courseId);
    const matchesAssignedRange =
      !assignedSince || (!!row.lastAssignedAt && row.lastAssignedAt.getTime() >= assignedSince.getTime());
    const matchesSearch =
      !q ||
      row.name.toLowerCase().includes(q) ||
      row.login.toLowerCase().includes(q) ||
      row.email?.toLowerCase().includes(q) ||
      row.department.toLowerCase().includes(q) ||
      row.groups.some((group) => group.toLowerCase().includes(q)) ||
      row.assignedCourseTitles.some((title) => title.toLowerCase().includes(q));

    return matchesStatus && matchesCourse && matchesAssignedRange && matchesSearch;
  });

  const reportRows = rows;

  return {
    rows,
    filteredRows,
    summary: {
      total: reportRows.length,
      withAssignments: reportRows.filter((row) => row.assignedCoursesCount > 0).length,
      inProgress: reportRows.filter((row) => row.statusCode === "in_progress").length,
      completed: reportRows.filter((row) => row.statusCode === "completed").length,
      failed: reportRows.reduce((sum, row) => sum + row.failedCoursesCount, 0),
      notStarted: reportRows.filter((row) => row.statusCode === "not_started").length,
      overdue: reportRows.reduce((sum, row) => sum + row.overdueCoursesCount, 0),
      noAssignments: reportRows.filter((row) => row.statusCode === "no_assignments").length,
      blocked: reportRows.filter((row) => row.accountStatus === USER_STATUSES.BLOCKED).length,
      pendingInvites,
    },
  };
}

function parseDateStart(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createCourseAssignmentSeed(): CourseAssignmentSeed {
  return {
    assignedAtCandidates: [],
    directExpiresAtCandidates: [],
    inheritedExpiresAtCandidates: [],
  };
}

function hasFailedRequiredQuiz(
  items: Array<{
    isRequired: boolean;
    type: string;
    quiz: { id: string; maxAttempts: number; minCorrectAnswers: number } | null;
  }>,
  learnerId: string,
  quizAttemptsByUserAndQuiz: Map<
    string,
    Array<{
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      completedAt: Date;
    }>
  >
) {
  return items.some((item) => {
    if (!item.isRequired || item.type !== "QUIZ" || !item.quiz) return false;
    const attempts = quizAttemptsByUserAndQuiz.get(`${learnerId}:${item.quiz.id}`) ?? [];
    return getQuizProgress(item.quiz, attempts).isFailed;
  });
}

function parseDateEnd(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAssignedSince(value?: string | null) {
  if (!value || value === "all") return null;
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function compareLearnerNames(left: string, right: string, sort: LearnerReportSort) {
  const result = left.localeCompare(right, "ru");
  return sort === "name_desc" ? -result : result;
}

function getUserStatusWhere(filter: LearnerReportUserStatus) {
  if (filter === "blocked") return USER_STATUSES.BLOCKED;
  if (filter === "all") return { in: [USER_STATUSES.ACTIVE, USER_STATUSES.BLOCKED] };
  return USER_STATUSES.ACTIVE;
}

export function getLearnerReportStatusParam(value?: string | null): LearnerReportStatus {
  if (
    value === "with_assignments" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "not_started" ||
    value === "no_assignments" ||
    value === "blocked"
  ) {
    return value;
  }
  return "all";
}

export function getLearnerReportSortParam(value?: string | null): LearnerReportSort {
  return value === "name_desc" ? "name_desc" : "name_asc";
}

export function getLearnerReportUserStatusParam(value?: string | null): LearnerReportUserStatus {
  if (value === "blocked" || value === "all") return value;
  return "active";
}

export function buildLearnersReportCsv(data: LearnersReportData) {
  const rows = getLearnersReportExportRows(data);
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}`;
}

export function buildLearnersReportXlsx(data: LearnersReportData) {
  return buildXlsxWorkbook({
    sheetName: "Ученики",
    rows: getLearnersReportExportRows(data),
    createdAt: new Date(),
  });
}

export function formatDateTimeRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getLearnersReportExportRows(data: LearnersReportData) {
  const rows: Array<Array<string | number>> = [
    ["Всего учеников", data.summary.total],
    ["С назначениями", data.summary.withAssignments],
    ["В обучении", data.summary.inProgress],
    ["Завершили все", data.summary.completed],
    ["Не пройдено назначений", data.summary.failed],
    ["Не начали", data.summary.notStarted],
    ["Просрочено назначений", data.summary.overdue],
    ["Без назначений", data.summary.noAssignments],
    ["Заблокированы", data.summary.blocked],
    ["Приглашения ожидают регистрации", data.summary.pendingInvites],
    [],
    [
      "ФИО",
      "Логин",
      "Email",
      "Статус аккаунта",
      "Подразделение",
      "Группы",
      "Назначено курсов",
      "Назначенные курсы",
      "Завершено курсов",
      "Не пройдено курсов",
      "Курсы в процессе",
      "Не начаты",
      "Просрочено курсов",
      "Обученность, %",
      "Средний прогресс, %",
      "Последнее назначение",
      "Последний вход",
      "Статус обучения",
    ],
  ];

  for (const row of data.filteredRows) {
    rows.push([
      row.name,
      row.login,
      row.email ?? "",
      row.accountStatusLabel,
      row.department,
      row.groups.join(", "),
      row.assignedCoursesCount,
      row.assignedCourseTitles.join(", "),
      row.completedCoursesCount,
      row.failedCoursesCount,
      row.inProgressCoursesCount,
      row.notStartedCoursesCount,
      row.overdueCoursesCount,
      row.learningPercent,
      row.averageProgressPercent,
      row.lastAssignedAt ? formatDateTimeRu(row.lastAssignedAt) : "",
      row.lastLoginAt ? formatDateTimeRu(row.lastLoginAt) : "",
      row.statusLabel,
    ]);
  }

  return rows;
}

function getLearnerStatusCode(args: {
  assignedCoursesCount: number;
  completedCoursesCount: number;
  inProgressCoursesCount: number;
}): Exclude<LearnerReportStatus, "all" | "with_assignments"> {
  if (args.assignedCoursesCount === 0) return "no_assignments";
  if (args.completedCoursesCount === args.assignedCoursesCount) return "completed";
  if (args.inProgressCoursesCount > 0 || args.completedCoursesCount > 0) return "in_progress";
  return "not_started";
}

function getLearnerStatusLabel(status: Exclude<LearnerReportStatus, "all" | "with_assignments">) {
  if (status === "completed") return "Завершил все";
  if (status === "in_progress") return "В обучении";
  if (status === "not_started") return "Не начал";
  return "Без назначений";
}

function getUserStatusLabel(status: string) {
  return isUserStatus(status) ? USER_STATUS_LABELS[status] : status;
}

function escapeCsvCell(value: string | number | null | undefined) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[;"\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
