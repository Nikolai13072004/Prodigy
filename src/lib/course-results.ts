import { canManageCourse } from "@/lib/access";
import { getCourseProgress, getQuizProgress } from "@/lib/course-progress";
import { getRequiredCorrectAnswers } from "@/lib/quiz-pass-rule";
import { isManualReviewQuestion } from "@/lib/quiz-manual-review";
import prisma from "@/lib/prisma";
import { PERMISSIONS, canAccessAllCourses, hasPermission, isPlatformAdminRole } from "@/lib/roles";
import { USER_STATUS_LABELS, isAccessRevokedUserStatus, isUserStatus } from "@/lib/users";
import { buildXlsxWorkbook } from "@/lib/xlsx";

export type ResultStatusCode = "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED";
export type ResultStatusFilter = "all" | "not_started" | "in_progress" | "passed" | "failed";

type SessionUserLike = {
  id: string;
  roles: string[];
  permissions: string[];
};

type ResultLearnerUser = {
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
  user: ResultLearnerUser;
  hasDirectAssignment: boolean;
  assignedGroups: Map<string, { name: string; assignedAt: Date }>;
  assignedAtCandidates: Date[];
};

type QuizAttemptLike = {
  userId: string;
  outcome: string;
  correctAnswers: number;
  attemptNumber: number;
  score: number;
  maxScore: number;
  completedAt: Date;
  reviewComment: string | null;
  reviewedAt: Date | null;
};

export type CourseResultRow = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  accountStatus: string;
  accountStatusLabel: string;
  department: string;
  assignedAt: Date | null;
  groups: string[];
  progress: ReturnType<typeof getCourseProgress>;
  quizCount: number;
  passedQuizCount: number;
  bestScore: number;
  maxScore: number;
  bestScorePercent: number;
  attemptsUsed: number;
  attemptsMax: number;
  lastAttemptAt: Date | null;
  resultStatusCode: ResultStatusCode;
  resultStatusLabel: string;
  hasAnyAttempt: boolean;
};

export type CourseAssessmentExportRow = {
  learnerId: string;
  learnerName: string;
  learnerLogin: string;
  learnerEmail: string | null;
  assessmentTitle: string;
  assessmentKindLabel: string;
  attemptedAt: Date | null;
  score: number | null;
  maxScore: number;
  requiredCorrectAnswers: number;
  totalQuestions: number;
  outcomeLabel: string;
  reviewStatusLabel: string | null;
  reviewComment: string | null;
};

export type CourseResultsData = {
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
    canViewResults: boolean;
    canOpenManage: boolean;
  };
  rows: CourseResultRow[];
  filteredRows: CourseResultRow[];
  assessmentRows: CourseAssessmentExportRow[];
  summary: {
    total: number;
    withAttempts: number;
    passed: number;
    failed: number;
    inProgress: number;
    notStarted: number;
    pendingInvites: number;
    quizCount: number;
  };
};

export async function getCourseResultsData(args: {
  courseId: string;
  user: SessionUserLike;
  q?: string;
  statusFilter: ResultStatusFilter;
}): Promise<CourseResultsData | null> {
  const { courseId, user, statusFilter } = args;
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
  const canViewResults =
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
    canViewResults,
    canOpenManage: canEditCourse || canPublishCourse || canManageAssignments,
  };

  const baseResponse = {
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
      publishedAt: course.publishedAt,
      updatedAt: course.updatedAt,
    },
    access,
  };

  if (!canViewResults) {
    return {
      ...baseResponse,
      rows: [],
      filteredRows: [],
      assessmentRows: [],
      summary: {
        total: 0,
        withAttempts: 0,
        passed: 0,
        failed: 0,
        inProgress: 0,
        notStarted: 0,
        pendingInvites: course.invites.length,
        quizCount: 0,
      },
    };
  }

  const learnerSeeds = new Map<string, LearnerSeed>();

  for (const assignment of course.directAssignments) {
    if (isAccessRevokedUserStatus(assignment.user.status)) continue;

    learnerSeeds.set(assignment.userId, {
      user: assignment.user,
      hasDirectAssignment: true,
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
      const assignedGroups = existing?.assignedGroups ?? new Map<string, { name: string; assignedAt: Date }>();
      assignedGroups.set(assignment.group.id, { name: assignment.group.name, assignedAt: assignment.assignedAt });

      learnerSeeds.set(membership.userId, {
        user: membership.user,
        hasDirectAssignment: existing?.hasDirectAssignment ?? false,
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
        },
      },
      quiz: {
        select: {
          id: true,
          maxAttempts: true,
          minCorrectAnswers: true,
          questions: {
            select: {
              points: true,
              type: true,
              config: true,
            },
          },
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
              maxScore: true,
              completedAt: true,
              reviewComment: true,
              reviewedAt: true,
            },
          },
        },
      },
    },
  });

  const materialProgressByUserAndItem = new Map<string, number>();
  const quizAttemptsByUserAndQuiz = new Map<string, QuizAttemptLike[]>();
  const quizItems = courseItems.filter((item) => item.type === "QUIZ" && item.quiz);
  const assessmentRows: CourseAssessmentExportRow[] = [];

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

  const rows = Array.from(learnerSeeds.values())
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

      const quizSummaries = quizItems.map((item) => {
        const attempts = quizAttemptsByUserAndQuiz.get(`${seed.user.id}:${item.quiz!.id}`) ?? [];
        const quizProgress = getQuizProgress(item.quiz!, attempts);
        const maxScore = item.quiz!.questions.reduce((sum, question) => sum + question.points, 0);
        const requiredCorrectAnswers = getRequiredCorrectAnswers(
          item.quiz!.minCorrectAnswers,
          item.quiz!.questions.length
        );
        const latestAttempt = getLatestAssessmentAttempt(attempts);
        const hasManualReview = item.quiz!.questions.some((question) =>
          isManualReviewQuestion({ type: question.type, config: question.config })
        );
        const lastAttemptAt = attempts.reduce<Date | null>(
          (latest, attempt) => (!latest || attempt.completedAt.getTime() > latest.getTime() ? attempt.completedAt : latest),
          null
        );

        assessmentRows.push({
          learnerId: seed.user.id,
          learnerName: seed.user.name,
          learnerLogin: seed.user.login,
          learnerEmail: seed.user.email,
          assessmentTitle: item.title,
          assessmentKindLabel: hasManualReview ? "Задание" : "Тест",
          attemptedAt: latestAttempt?.completedAt ?? null,
          score: latestAttempt?.score ?? null,
          maxScore: latestAttempt?.maxScore ?? maxScore,
          requiredCorrectAnswers,
          totalQuestions: item.quiz!.questions.length,
          outcomeLabel: latestAttempt ? getAttemptOutcomeExportLabel(latestAttempt.outcome) : "Не отправлено",
          reviewStatusLabel: hasManualReview ? getAssessmentReviewStatusLabel(latestAttempt) : null,
          reviewComment: latestAttempt?.reviewComment?.trim() || null,
        });

        return {
          maxAttempts: item.quiz!.maxAttempts,
          maxScore,
          lastAttemptAt,
          result: quizProgress,
        };
      });

      const quizCount = quizSummaries.length;
      const passedQuizCount = quizSummaries.filter((entry) => entry.result.isPassed).length;
      const attemptsUsed = quizSummaries.reduce((sum, entry) => sum + entry.result.attemptsUsed, 0);
      const attemptsMax = quizSummaries.reduce((sum, entry) => sum + entry.maxAttempts, 0);
      const bestScore = quizSummaries.reduce((sum, entry) => sum + (entry.result.bestAttempt?.score ?? 0), 0);
      const maxScore = quizSummaries.reduce((sum, entry) => sum + entry.maxScore, 0);
      const hasAnyAttempt = quizSummaries.some((entry) => entry.result.attemptsUsed > 0 || entry.result.hasInProgress);
      const resultStatusCode = getResultStatusCode({
        quizCount,
        passedQuizCount,
        hasAnyAttempt,
        hasFailedQuiz: quizSummaries.some((entry) => entry.result.status.code === "FAILED"),
      });
      const resultStatusLabel = quizCount === 0 ? "Нет тестов" : getResultStatusLabel(resultStatusCode);
      const lastAttemptAt = quizSummaries.reduce<Date | null>(
        (latest, entry) =>
          !entry.lastAttemptAt || (latest && latest.getTime() >= entry.lastAttemptAt.getTime()) ? latest : entry.lastAttemptAt,
        null
      );
      const assignedAt = seed.assignedAtCandidates.reduce<Date | null>(
        (earliest, value) => (!earliest || value.getTime() < earliest.getTime() ? value : earliest),
        null
      );
      const groups = seed.user.groupMemberships
        .map((membership) => membership.group.name)
        .sort((left, right) => left.localeCompare(right, "ru"));

      return {
        id: seed.user.id,
        name: seed.user.name,
        login: seed.user.login,
        email: seed.user.email,
        accountStatus: seed.user.status,
        accountStatusLabel: getUserStatusLabel(seed.user.status),
        department: seed.user.department?.name ?? "Без подразделения",
        assignedAt,
        groups,
        progress,
        quizCount,
        passedQuizCount,
        bestScore,
        maxScore,
        bestScorePercent: maxScore > 0 ? Math.round((bestScore / maxScore) * 100) : 0,
        attemptsUsed,
        attemptsMax,
        lastAttemptAt,
        resultStatusCode,
        resultStatusLabel,
        hasAnyAttempt,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));

  const filteredRows = rows.filter((row) => {
    const matchesStatus = statusFilter === "all" ? true : mapResultStatusCodeToFilter(row.resultStatusCode) === statusFilter;
    const matchesSearch =
      !q ||
      row.name.toLowerCase().includes(q) ||
      row.login.toLowerCase().includes(q) ||
      row.email?.toLowerCase().includes(q) ||
      row.department.toLowerCase().includes(q) ||
      row.groups.some((group) => group.toLowerCase().includes(q));

    return matchesStatus && matchesSearch;
  });

  return {
    ...baseResponse,
    rows,
    filteredRows,
    assessmentRows,
    summary: {
      total: rows.length,
      withAttempts: rows.filter((row) => row.hasAnyAttempt).length,
      passed: rows.filter((row) => row.resultStatusCode === "PASSED").length,
      failed: rows.filter((row) => row.resultStatusCode === "FAILED").length,
      inProgress: rows.filter((row) => row.resultStatusCode === "IN_PROGRESS").length,
      notStarted: rows.filter((row) => row.resultStatusCode === "NOT_STARTED").length,
      pendingInvites: course.invites.length,
      quizCount: quizItems.length,
    },
  };
}

export function getResultStatusParam(value?: string | null): ResultStatusFilter {
  if (
    value === "passed" ||
    value === "failed" ||
    value === "in_progress" ||
    value === "not_started"
  ) {
    return value;
  }
  return "all";
}

export function buildCourseResultsCsv(data: CourseResultsData) {
  const rows = getCourseResultsExportRows(data);
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}`;
}

export function buildCourseResultsXlsx(data: CourseResultsData) {
  return buildXlsxWorkbook({
    sheetName: "Результаты",
    rows: getCourseResultsExportRows(data),
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

function getCourseResultsExportRows(data: CourseResultsData) {
  const filteredLearnerIds = new Set(data.filteredRows.map((row) => row.id));
  const rows: Array<Array<string | number>> = [
    ["Курс", data.course.title],
    ["Статус курса", data.course.status === "PUBLISHED" ? "Опубликован" : "Черновик"],
    ["Ученики в отчете", data.summary.total],
    ["С попытками", data.summary.withAttempts],
    ["Пройдены", data.summary.passed],
    ["В работе", data.summary.inProgress],
    ["Не пройдены", data.summary.failed],
    ["Не начали", data.summary.notStarted],
    ["Тестов в курсе", data.summary.quizCount],
    [],
    [
      "ФИО",
      "Логин",
      "Email",
      "Статус аккаунта",
      "Подразделение",
      "Все группы пользователя",
      "Дата назначения",
      "Общий прогресс, %",
      "Пройдено тестов",
      "Всего тестов",
      "Лучший результат",
      "Попытки",
      "Последняя попытка",
      "Статус теста",
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
      row.assignedAt ? formatDateTimeRu(row.assignedAt) : "",
      row.progress.percent,
      row.passedQuizCount,
      row.quizCount,
      row.quizCount > 0 ? `${row.bestScore}/${row.maxScore}` : "—",
      row.quizCount > 0 ? `${row.attemptsUsed}/${row.attemptsMax}` : "—",
      row.lastAttemptAt ? formatDateTimeRu(row.lastAttemptAt) : "",
      row.resultStatusLabel,
    ]);
  }

  rows.push(
    [],
    ["Оценки по тестам и заданиям"],
    [
      "ФИО",
      "Логин",
      "Email",
      "Элемент",
      "Тип",
      "Дата попытки",
      "Баллы",
      "Порог прохождения",
      "Результат",
      "Статус проверки",
      "Комментарий",
    ]
  );

  for (const row of data.assessmentRows.filter((item) => filteredLearnerIds.has(item.learnerId))) {
    rows.push([
      row.learnerName,
      row.learnerLogin,
      row.learnerEmail ?? "",
      row.assessmentTitle,
      row.assessmentKindLabel,
      row.attemptedAt ? formatDateTimeRu(row.attemptedAt) : "",
      row.score !== null ? `${row.score}/${row.maxScore}` : "—",
      `${row.requiredCorrectAnswers} из ${row.totalQuestions}`,
      row.outcomeLabel,
      row.reviewStatusLabel ?? "",
      row.reviewComment ?? "",
    ]);
  }

  return rows;
}

function getLatestAssessmentAttempt<T extends { outcome: string }>(attempts: T[]) {
  const completedAttempts = attempts.filter((attempt) => attempt.outcome !== "IN_PROGRESS");
  return completedAttempts.at(-1) ?? attempts.at(-1) ?? null;
}

function getResultStatusCode(args: {
  quizCount: number;
  passedQuizCount: number;
  hasAnyAttempt: boolean;
  hasFailedQuiz: boolean;
}): ResultStatusCode {
  if (args.quizCount === 0) return "NOT_STARTED";
  if (args.passedQuizCount === args.quizCount) return "PASSED";
  if (args.hasFailedQuiz) return "FAILED";
  if (args.hasAnyAttempt) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function getResultStatusLabel(status: ResultStatusCode) {
  if (status === "PASSED") return "Пройден";
  if (status === "FAILED") return "Не пройден";
  if (status === "IN_PROGRESS") return "В работе";
  return "Не начат";
}

function getAttemptOutcomeExportLabel(outcome: string) {
  if (outcome === "PASSED") return "Сдан";
  if (outcome === "PENDING_REVIEW") return "На проверке";
  if (outcome === "FAILED") return "Не сдан";
  if (outcome === "ATTEMPTED") return "Не сдан";
  if (outcome === "IN_PROGRESS") return "В работе";
  return outcome;
}

function getAssessmentReviewStatusLabel(
  attempt: { outcome: string; reviewedAt: Date | null; reviewComment: string | null } | null
) {
  if (!attempt) return null;
  if (attempt.outcome === "PENDING_REVIEW") return "На проверке";
  if (attempt.reviewedAt || attempt.reviewComment) return "Проверено";
  return "Проверено";
}

function mapResultStatusCodeToFilter(status: ResultStatusCode): Exclude<ResultStatusFilter, "all"> {
  if (status === "PASSED") return "passed";
  if (status === "FAILED") return "failed";
  if (status === "IN_PROGRESS") return "in_progress";
  return "not_started";
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
