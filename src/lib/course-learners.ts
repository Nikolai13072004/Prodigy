import { canManageCourse } from "@/lib/access";
import {
  resolveEffectiveCourseAccessWindow,
  type CourseAccessState,
} from "@/lib/course-access-window";
import { getCourseProgress } from "@/lib/course-progress";
import prisma from "@/lib/prisma";
import { PERMISSIONS, canAccessAllCourses, hasPermission, isPlatformAdminRole } from "@/lib/roles";
import { USER_STATUS_LABELS, isAccessRevokedUserStatus, isUserStatus } from "@/lib/users";
import { buildXlsxWorkbook } from "@/lib/xlsx";

export type LearnerState = "active" | "completed" | "dropped";
export type LearnerStatusFilter = "all" | LearnerState;
export type LearnerAccessFilter = "all" | CourseAccessState;
export type CourseLearnerSortField =
  | "name"
  | "department"
  | "assignmentSource"
  | "groups"
  | "assignedAt"
  | "lastActivityAt"
  | "access"
  | "progress"
  | "status";
export type CourseLearnerSortDirection = "asc" | "desc";

type SessionUserLike = {
  id: string;
  roles: string[];
  permissions: string[];
};

type LearnerUser = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  status: string;
  department: { name: string } | null;
  groupMemberships: Array<{
    group: {
      id: string;
      name: string;
    };
  }>;
};

type LearnerSeed = {
  user: LearnerUser;
  directAssignments: Array<{ assignedAt: Date; expiresAt: Date | null }>;
  assignedGroups: Map<string, { name: string; assignedAt: Date; expiresAt: Date | null }>;
  assignedAtCandidates: Date[];
};

export type CourseLearnerRow = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  accountStatus: string;
  accountStatusLabel: string;
  department: string;
  assignedAt: Date | null;
  assignmentSource: string;
  assignedGroups: string[];
  groups: string[];
  accessExpiresAt: Date | null;
  accessState: CourseAccessState;
  accessStateLabel: string;
  hasUnlimitedAccess: boolean;
  lastActivityAt: Date | null;
  progress: ReturnType<typeof getCourseProgress>;
  state: LearnerState;
  stateLabel: string;
};

export type CourseLearnersData = {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    publishedAt: Date | null;
    updatedAt: Date;
  };
  access: {
    canEditCourse: boolean;
    canPublishCourse: boolean;
    canManageAssignments: boolean;
    canViewReports: boolean;
    canViewLearners: boolean;
    canOpenManage: boolean;
  };
  learnerRows: CourseLearnerRow[];
  filteredLearners: CourseLearnerRow[];
  summary: {
    total: number;
    active: number;
    completed: number;
    dropped: number;
    activeAccess: number;
    expiredAccess: number;
    pendingInvites: number;
  };
};

export async function getCourseLearnersData(args: {
  courseId: string;
  user: SessionUserLike;
  q?: string;
  statusFilter: LearnerStatusFilter;
  accessFilter: LearnerAccessFilter;
  sortBy: CourseLearnerSortField;
  sortDir: CourseLearnerSortDirection;
}): Promise<CourseLearnersData | null> {
  const { courseId, user, statusFilter, accessFilter, sortBy, sortDir } = args;
  const q = (args.q ?? "").trim().toLowerCase();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      quizGateMode: true,
      ownerId: true,
      publishedAt: true,
      updatedAt: true,
      directAssignments: {
        select: {
          userId: true,
          assignedAt: true,
          expiresAt: true,
          user: {
            select: {
              id: true,
              name: true,
              login: true,
              email: true,
              status: true,
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
            },
          },
        },
      },
      groupAssignments: {
        select: {
          assignedAt: true,
          expiresAt: true,
          group: {
            select: {
              id: true,
              name: true,
              memberships: {
                select: {
                  userId: true,
                  user: {
                    select: {
                      id: true,
                      name: true,
                      login: true,
                      email: true,
                      status: true,
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
                    },
                  },
                },
              },
            },
          },
        },
      },
      invites: {
        where: { status: "PENDING" },
        select: { email: true },
      },
    },
  });

  if (!course) return null;

  const canEditCourse =
    hasPermission(user.roles, PERMISSIONS.COURSES_CREATE_EDIT, user.permissions) &&
    canManageCourse(user.roles, user.id, { ownerId: course.ownerId });
  const canPublishCourse =
    hasPermission(user.roles, PERMISSIONS.COURSES_PUBLISH, user.permissions) &&
    canManageCourse(user.roles, user.id, { ownerId: course.ownerId });
  const canManageAssignments = hasPermission(
    user.roles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    user.permissions
  );
  const canViewReports = hasPermission(user.roles, PERMISSIONS.REPORTS_VIEW, user.permissions);
  const canViewLearners =
    isPlatformAdminRole(user.roles) ||
    canViewReports ||
    canManageAssignments ||
    canEditCourse ||
    canPublishCourse ||
    canAccessAllCourses(user.roles, user.permissions);

  const access = {
    canEditCourse,
    canPublishCourse,
    canManageAssignments,
    canViewReports,
    canViewLearners,
    canOpenManage: canEditCourse || canPublishCourse || canManageAssignments,
  };

  if (!canViewLearners) {
    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        status: course.status,
        publishedAt: course.publishedAt,
        updatedAt: course.updatedAt,
      },
      access,
      learnerRows: [],
      filteredLearners: [],
      summary: {
        total: 0,
        active: 0,
        completed: 0,
        dropped: 0,
        pendingInvites: course.invites.length,
        activeAccess: 0,
        expiredAccess: 0,
      },
    };
  }

  const learnerSeeds = new Map<string, LearnerSeed>();

  for (const assignment of course.directAssignments) {
    if (isAccessRevokedUserStatus(assignment.user.status)) continue;

    learnerSeeds.set(assignment.userId, {
      user: assignment.user,
      directAssignments: [
        ...(learnerSeeds.get(assignment.userId)?.directAssignments ?? []),
        { assignedAt: assignment.assignedAt, expiresAt: assignment.expiresAt },
      ],
      assignedGroups: learnerSeeds.get(assignment.userId)?.assignedGroups ?? new Map(),
      assignedAtCandidates: [
        ...(learnerSeeds.get(assignment.userId)?.assignedAtCandidates ?? []),
        assignment.assignedAt,
      ],
    });
  }

  for (const assignment of course.groupAssignments) {
    for (const membership of assignment.group.memberships) {
      if (isAccessRevokedUserStatus(membership.user.status)) continue;

      const existing = learnerSeeds.get(membership.userId);
      const assignedGroups =
        existing?.assignedGroups ?? new Map<string, { name: string; assignedAt: Date; expiresAt: Date | null }>();
      assignedGroups.set(assignment.group.id, {
        name: assignment.group.name,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
      });

      learnerSeeds.set(membership.userId, {
        user: membership.user,
        directAssignments: existing?.directAssignments ?? [],
        assignedGroups,
        assignedAtCandidates: [...(existing?.assignedAtCandidates ?? []), assignment.assignedAt],
      });
    }
  }

  const learnerIds = Array.from(learnerSeeds.keys());

  const courseItems = await prisma.courseItem.findMany({
    where: { courseId },
    orderBy: { orderIndex: "asc" },
    include: {
      views: {
        where: {
          userId: { in: learnerIds },
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
  });

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

  const learnerRows = Array.from(learnerSeeds.values())
    .map((seed) => {
      const progress = getCourseProgress({
        courseTitle: course.title,
        courseDescription: course.description,
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
        items: courseItems.map((item) => {
          const materialProgress = materialProgressByUserAndItem.get(`${seed.user.id}:${item.id}`) ?? 0;

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
                  attempts: quizAttemptsByUserAndQuiz.get(`${seed.user.id}:${item.quiz.id}`) ?? [],
                }
              : null,
          };
        }),
      });

      const accessWindow = resolveEffectiveCourseAccessWindow(
        seed.directAssignments.map((assignment) => assignment.expiresAt),
        Array.from(seed.assignedGroups.values()).map((group) => group.expiresAt)
      );
      const accessState = accessWindow?.state ?? "active";
      const state = getLearnerState(progress, accessState);
      const assignedAt = seed.assignedAtCandidates.reduce<Date | null>(
        (earliest, value) => (!earliest || value.getTime() < earliest.getTime() ? value : earliest),
        null
      );
      const assignedGroups = Array.from(seed.assignedGroups.values())
        .map((group) => group.name)
        .sort((left, right) => left.localeCompare(right, "ru"));
      const allGroups = seed.user.groupMemberships
        .map((membership) => membership.group.name)
        .sort((left, right) => left.localeCompare(right, "ru"));
      const lastMaterialActivityAt = courseItems.reduce<Date | null>((latest, item) => {
        const view = item.views.find((entry) => entry.userId === seed.user.id);
        if (!view?.viewedAt) return latest;
        return !latest || view.viewedAt.getTime() > latest.getTime() ? view.viewedAt : latest;
      }, null);
      const lastQuizActivityAt = courseItems.reduce<Date | null>((latest, item) => {
        if (!item.quiz) return latest;
        const attempts = quizAttemptsByUserAndQuiz.get(`${seed.user.id}:${item.quiz.id}`) ?? [];
        const lastAttemptAt = attempts.reduce<Date | null>(
          (innerLatest, attempt) =>
            !innerLatest || attempt.completedAt.getTime() > innerLatest.getTime()
              ? attempt.completedAt
              : innerLatest,
          null
        );
        if (!lastAttemptAt) return latest;
        return !latest || lastAttemptAt.getTime() > latest.getTime() ? lastAttemptAt : latest;
      }, null);
      const lastActivityAt = [lastMaterialActivityAt, lastQuizActivityAt].reduce<Date | null>(
        (latest, value) =>
          !value || (latest && latest.getTime() >= value.getTime()) ? latest : value,
        null
      );

      return {
        id: seed.user.id,
        name: seed.user.name,
        login: seed.user.login,
        email: seed.user.email,
        accountStatus: seed.user.status,
        accountStatusLabel: getUserStatusLabel(seed.user.status),
        department: seed.user.department?.name ?? "Без подразделения",
        assignedAt,
        assignmentSource: getAssignmentSourceLabel(seed.directAssignments.length > 0, assignedGroups.length > 0),
        assignedGroups,
        groups: allGroups,
        accessExpiresAt: accessWindow?.expiresAt ?? null,
        accessState,
        accessStateLabel: getLearnerAccessStateLabel(accessState, accessWindow?.isUnlimited ?? true),
        hasUnlimitedAccess: accessWindow?.isUnlimited ?? true,
        lastActivityAt,
        progress,
        state,
        stateLabel: getLearnerStateLabel(state),
      };
    });

  const filteredLearners = sortCourseLearnerRows(
    learnerRows.filter((learner) => {
      const matchesStatus = statusFilter === "all" ? true : learner.state === statusFilter;
      const matchesAccess = accessFilter === "all" ? true : learner.accessState === accessFilter;
      const matchesSearch =
        !q ||
        learner.name.toLowerCase().includes(q) ||
      learner.login.toLowerCase().includes(q) ||
      learner.email?.toLowerCase().includes(q) ||
      learner.department.toLowerCase().includes(q) ||
        learner.groups.some((group) => group.toLowerCase().includes(q));

      return matchesStatus && matchesAccess && matchesSearch;
    }),
    sortBy,
    sortDir
  );

  return {
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
      publishedAt: course.publishedAt,
      updatedAt: course.updatedAt,
    },
    access,
    learnerRows,
    filteredLearners,
    summary: {
      total: learnerRows.length,
      active: learnerRows.filter((learner) => learner.state === "active").length,
      completed: learnerRows.filter((learner) => learner.state === "completed").length,
      dropped: learnerRows.filter((learner) => learner.state === "dropped").length,
      activeAccess: learnerRows.filter((learner) => learner.accessState === "active").length,
      expiredAccess: learnerRows.filter((learner) => learner.accessState === "expired").length,
      pendingInvites: course.invites.length,
    },
  };
}

export function getLearnerStatusParam(value?: string | null): LearnerStatusFilter {
  if (value === "completed" || value === "active" || value === "dropped") return value;
  if (value === "in_progress" || value === "not_started") return "active";
  return "all";
}

export function getLearnerAccessParam(value?: string | null): LearnerAccessFilter {
  if (value === "active" || value === "expired") return value;
  return "all";
}

export function getLearnerStateLabel(state: LearnerState) {
  if (state === "completed") return "Завершил";
  if (state === "dropped") return "Бросил";
  return "Активен";
}

export function getLearnerAccessStateLabel(state: CourseAccessState, isUnlimited = false) {
  if (state === "active" && isUnlimited) return "Бессрочно";
  if (state === "active") return "Активен";
  return "Истек";
}

export function buildCourseLearnersCsv(data: CourseLearnersData) {
  const rows = getCourseLearnersExportRows(data);
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}`;
}

export function buildCourseLearnersXlsx(data: CourseLearnersData) {
  return buildXlsxWorkbook({
    sheetName: "Ученики",
    rows: getCourseLearnersExportRows(data),
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

function getCourseLearnersExportRows(data: CourseLearnersData) {
  const rows: Array<Array<string | number>> = [
    ["Курс", data.course.title],
    ["Статус курса", data.course.status === "PUBLISHED" ? "Опубликован" : "Черновик"],
    ["Записано учеников", data.summary.total],
    ["Активны", data.summary.active],
    ["Завершили", data.summary.completed],
    ["Бросили", data.summary.dropped],
    ["Приглашения ожидают регистрации", data.summary.pendingInvites],
    [],
    [
      "ФИО",
      "Логин",
      "Email",
      "Статус аккаунта",
      "Подразделение",
      "Источник назначения",
      "Группы назначения",
      "Все группы пользователя",
      "Дата назначения",
      "Дата последнего визита",
      "Статус доступа",
      "Доступ до",
      "Прогресс, %",
      "Пройдено этапов",
      "Всего этапов",
      "Статус обучения",
    ],
  ];

  for (const learner of data.filteredLearners) {
    rows.push([
      learner.name,
      learner.login,
      learner.email ?? "",
      learner.accountStatusLabel,
      learner.department,
      learner.assignmentSource,
      learner.assignedGroups.join(", "),
      learner.groups.join(", "),
      learner.assignedAt ? formatDateTimeRu(learner.assignedAt) : "",
      learner.lastActivityAt ? formatDateTimeRu(learner.lastActivityAt) : "",
      learner.accessStateLabel,
      learner.accessExpiresAt ? formatDateTimeRu(learner.accessExpiresAt) : learner.hasUnlimitedAccess ? "Без срока" : "",
      learner.progress.percent,
      learner.progress.completedRequired,
      learner.progress.requiredTotal,
      learner.stateLabel,
    ]);
  }

  return rows;
}

function getAssignmentSourceLabel(hasDirectAssignment: boolean, hasGroupAssignment: boolean) {
  if (hasDirectAssignment && hasGroupAssignment) return "Напрямую и через группу";
  if (hasDirectAssignment) return "Напрямую";
  return "Через группу";
}

function getLearnerState(
  progress: ReturnType<typeof getCourseProgress>,
  accessState: CourseAccessState
): LearnerState {
  if (progress.isCompleted) return "completed";
  if (accessState === "expired") return "dropped";
  return "active";
}

function getUserStatusLabel(status: string) {
  return isUserStatus(status) ? USER_STATUS_LABELS[status] : status;
}

function escapeCsvCell(value: string | number | null | undefined) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[;"\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

const COURSE_LEARNER_SORT_FIELDS: CourseLearnerSortField[] = [
  "name",
  "department",
  "assignmentSource",
  "groups",
  "assignedAt",
  "lastActivityAt",
  "access",
  "progress",
  "status",
];

export function getCourseLearnerSortField(value?: string | null): CourseLearnerSortField {
  if (value && COURSE_LEARNER_SORT_FIELDS.includes(value as CourseLearnerSortField)) {
    return value as CourseLearnerSortField;
  }
  return "name";
}

export function getCourseLearnerSortDirection(value?: string | null): CourseLearnerSortDirection {
  return value === "desc" ? "desc" : "asc";
}

function sortCourseLearnerRows(
  rows: CourseLearnerRow[],
  sortBy: CourseLearnerSortField,
  sortDir: CourseLearnerSortDirection
) {
  return [...rows].sort((left, right) => {
    const result =
      sortBy === "department"
        ? compareText(left.department, right.department, sortDir)
        : sortBy === "assignmentSource"
          ? compareText(left.assignmentSource, right.assignmentSource, sortDir)
          : sortBy === "groups"
            ? compareText(left.groups.join(", "), right.groups.join(", "), sortDir)
            : sortBy === "assignedAt"
              ? compareOptionalDate(left.assignedAt, right.assignedAt, sortDir)
              : sortBy === "lastActivityAt"
                ? compareOptionalDate(left.lastActivityAt, right.lastActivityAt, sortDir)
                : sortBy === "access"
                  ? compareAccess(left, right, sortDir)
                  : sortBy === "progress"
                    ? compareNumber(left.progress.percent, right.progress.percent, sortDir)
                    : sortBy === "status"
                      ? compareState(left.state, right.state, sortDir)
                      : compareText(left.name, right.name, sortDir);

    return result !== 0 ? result : compareText(left.name, right.name, "asc");
  });
}

function compareText(left: string, right: string, sortDir: CourseLearnerSortDirection) {
  const result = left.localeCompare(right, "ru");
  return sortDir === "asc" ? result : -result;
}

function compareNumber(left: number, right: number, sortDir: CourseLearnerSortDirection) {
  const result = left - right;
  return sortDir === "asc" ? result : -result;
}

function compareOptionalDate(
  left: Date | null,
  right: Date | null,
  sortDir: CourseLearnerSortDirection
) {
  if (!left && !right) return 0;
  if (!left) return sortDir === "asc" ? 1 : -1;
  if (!right) return sortDir === "asc" ? -1 : 1;
  return compareNumber(left.getTime(), right.getTime(), sortDir);
}

function compareState(
  left: LearnerState,
  right: LearnerState,
  sortDir: CourseLearnerSortDirection
) {
  const rank = {
    active: 0,
    completed: 1,
    dropped: 2,
  } satisfies Record<LearnerState, number>;

  return compareNumber(rank[left], rank[right], sortDir);
}

function compareAccess(
  left: CourseLearnerRow,
  right: CourseLearnerRow,
  sortDir: CourseLearnerSortDirection
) {
  const stateResult = compareNumber(left.accessState === "active" ? 0 : 1, right.accessState === "active" ? 0 : 1, sortDir);
  if (stateResult !== 0) return stateResult;

  const unlimitedResult = compareNumber(left.hasUnlimitedAccess ? 0 : 1, right.hasUnlimitedAccess ? 0 : 1, sortDir);
  if (unlimitedResult !== 0) return unlimitedResult;

  return compareOptionalDate(left.accessExpiresAt, right.accessExpiresAt, sortDir);
}
