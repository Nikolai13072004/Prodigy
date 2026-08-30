import { getCourseProgress } from "@/lib/course-progress";
import prisma from "@/lib/prisma";
import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { isAccessRevokedUserStatus } from "@/lib/users";
import { buildXlsxWorkbook } from "@/lib/xlsx";

type GroupMemberUser = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  status: string;
  role: string;
  department: {
    name: string;
  } | null;
  userRoles: Array<{
    roleProfile: {
      name: string;
    };
  }>;
};

type CourseSnapshot = {
  id: string;
  title: string;
  description: string | null;
  quizGateMode: string;
  items: Array<{
    id: string;
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
        completedAt: Date;
      }>;
    } | null;
  }>;
};

export type GroupProgressCourseOption = {
  id: string;
  title: string;
  assignedLearnersCount: number;
  completedLearnersCount: number;
  avgProgressPercent: number;
};

export type GroupProgressLearnerRow = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  departmentName: string;
  assignedCoursesCount: number;
  completedCoursesCount: number;
  averageProgressPercent: number;
  statusLabel: string;
  lastActivityAt: Date | null;
  selectedCourseTitle: string | null;
  selectedCourseProgressPercent: number | null;
  selectedCourseStatusLabel: string | null;
  courseTitles: string[];
};

export type GroupProgressComparisonRow = {
  groupId: string;
  groupName: string;
  learnersCount: number;
  assignedCoursesCount: number;
  completedLearnersCount: number;
  avgProgressPercent: number;
  isSelected: boolean;
};

export type GroupProgressReportData = {
  group: {
    id: string;
    name: string;
    description: string | null;
  };
  courseFilter: {
    selectedCourseId: string;
    selectedCourseTitle: string | null;
    options: GroupProgressCourseOption[];
  };
  summary: {
    learnersCount: number;
    assignedCoursesCount: number;
    completedLearnersCount: number;
    avgProgressPercent: number;
    comparisonRank: number | null;
    totalComparedGroups: number;
  };
  learners: GroupProgressLearnerRow[];
  comparisonRows: GroupProgressComparisonRow[];
};

type GroupSeed = {
  id: string;
  name: string;
  description: string | null;
  learners: GroupMemberUser[];
  courseOptions: Array<{ id: string; title: string }>;
};

type LearnerCourseSnapshot = {
  progressPercent: number;
  isCompleted: boolean;
  statusLabel: string;
  lastActivityAt: Date | null;
};

type GroupLearnerAggregate = {
  learner: GroupMemberUser;
  assignedCoursesCount: number;
  completedCoursesCount: number;
  averageProgressPercent: number;
  lastActivityAt: Date | null;
  courseTitles: string[];
  snapshotsByCourseId: Map<string, LearnerCourseSnapshot>;
};

export async function getGroupProgressReportData(args: {
  groupId: string;
  courseId?: string;
}): Promise<GroupProgressReportData | null> {
  const groupsRaw = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      memberships: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              login: true,
              email: true,
              status: true,
              role: true,
              department: {
                select: { name: true },
              },
              userRoles: {
                select: {
                  roleProfile: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      },
      courseAssignments: {
        where: {
          course: {
            status: "PUBLISHED",
          },
        },
        select: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  const groups: GroupSeed[] = groupsRaw.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    learners: group.memberships
      .map((membership) => membership.user)
      .filter(isEligibleGroupLearner)
      .sort((left, right) => left.name.localeCompare(right.name, "ru", { sensitivity: "base", numeric: true })),
    courseOptions: dedupeCourseOptions(
      group.courseAssignments.map((assignment) => ({
        id: assignment.course.id,
        title: assignment.course.title,
      }))
    ),
  }));

  const selectedGroup = groups.find((group) => group.id === args.groupId);
  if (!selectedGroup) return null;

  const selectedCourseId = selectedGroup.courseOptions.some((course) => course.id === args.courseId)
    ? args.courseId ?? ""
    : "";
  const selectedCourseTitle =
    selectedGroup.courseOptions.find((course) => course.id === selectedCourseId)?.title ?? null;

  const comparisonSeeds = groups.filter((group) => {
    if (selectedCourseId) {
      return group.courseOptions.some((course) => course.id === selectedCourseId) || group.id === selectedGroup.id;
    }

    return group.courseOptions.length > 0 || group.id === selectedGroup.id;
  });

  const relevantCourseIds = new Set<string>();
  const relevantLearnerIds = new Set<string>();

  for (const group of comparisonSeeds) {
    const courseIds = resolveGroupCourseIds(group, selectedCourseId);
    for (const courseId of courseIds) {
      relevantCourseIds.add(courseId);
    }
    for (const learner of group.learners) {
      relevantLearnerIds.add(learner.id);
    }
  }

  const courseSnapshots = relevantCourseIds.size && relevantLearnerIds.size
    ? await prisma.course.findMany({
        where: {
          id: {
            in: Array.from(relevantCourseIds),
          },
        },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          quizGateMode: true,
          items: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              type: true,
              isRequired: true,
              views: {
                where: {
                  userId: {
                    in: Array.from(relevantLearnerIds),
                  },
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
                      userId: {
                        in: Array.from(relevantLearnerIds),
                      },
                    },
                    orderBy: [{ userId: "asc" }, { attemptNumber: "asc" }],
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
          },
        },
      })
    : [];

  const courseById = new Map(courseSnapshots.map((course) => [course.id, course] as const));
  const selectedGroupLearners = buildGroupLearnerAggregates(selectedGroup, courseById, selectedCourseId);

  const courseOptions = selectedGroup.courseOptions.map((course) => ({
    id: course.id,
    title: course.title,
    assignedLearnersCount: selectedGroup.learners.length,
    completedLearnersCount: selectedGroup.learners.filter((learner) => {
      const snapshot = getLearnerCourseSnapshot(courseById.get(course.id), learner.id);
      return snapshot.isCompleted;
    }).length,
    avgProgressPercent: roundPercent(
      selectedGroup.learners.length
        ? selectedGroup.learners.reduce((sum, learner) => {
            const snapshot = getLearnerCourseSnapshot(courseById.get(course.id), learner.id);
            return sum + snapshot.progressPercent;
          }, 0) / selectedGroup.learners.length
        : 0
    ),
  }));

  const comparisonRows = comparisonSeeds
    .map<GroupProgressComparisonRow>((group) => {
      const learnerAggregates = buildGroupLearnerAggregates(group, courseById, selectedCourseId);
      const assignedCoursesCount = resolveGroupCourseIds(group, selectedCourseId).length;
      const completedLearnersCount = learnerAggregates.filter(
        (learner) => learner.assignedCoursesCount > 0 && learner.completedCoursesCount === learner.assignedCoursesCount
      ).length;
      const avgProgressPercent = roundPercent(
        learnerAggregates.length
          ? learnerAggregates.reduce((sum, learner) => sum + learner.averageProgressPercent, 0) / learnerAggregates.length
          : 0
      );

      return {
        groupId: group.id,
        groupName: group.name,
        learnersCount: learnerAggregates.length,
        assignedCoursesCount,
        completedLearnersCount,
        avgProgressPercent,
        isSelected: group.id === selectedGroup.id,
      };
    })
    .sort((left, right) => {
      if (right.avgProgressPercent !== left.avgProgressPercent) {
        return right.avgProgressPercent - left.avgProgressPercent;
      }
      if (right.learnersCount !== left.learnersCount) {
        return right.learnersCount - left.learnersCount;
      }
      return left.groupName.localeCompare(right.groupName, "ru", { sensitivity: "base", numeric: true });
    });

  const selectedComparisonRow = comparisonRows.find((row) => row.groupId === selectedGroup.id) ?? null;
  const comparisonRank = selectedComparisonRow
    ? comparisonRows.findIndex((row) => row.groupId === selectedGroup.id) + 1
    : null;

  return {
    group: {
      id: selectedGroup.id,
      name: selectedGroup.name,
      description: selectedGroup.description,
    },
    courseFilter: {
      selectedCourseId,
      selectedCourseTitle,
      options: courseOptions,
    },
    summary: {
      learnersCount: selectedGroupLearners.length,
      assignedCoursesCount: selectedCourseId ? (selectedCourseTitle ? 1 : 0) : selectedGroup.courseOptions.length,
      completedLearnersCount:
        selectedGroupLearners.filter(
          (learner) => learner.assignedCoursesCount > 0 && learner.completedCoursesCount === learner.assignedCoursesCount
        ).length,
      avgProgressPercent: selectedComparisonRow?.avgProgressPercent ?? 0,
      comparisonRank,
      totalComparedGroups: comparisonRows.length,
    },
    learners: selectedGroupLearners.map((learner) => {
      const selectedCourseSnapshot =
        selectedCourseId && learner.snapshotsByCourseId.has(selectedCourseId)
          ? learner.snapshotsByCourseId.get(selectedCourseId)!
          : null;

      return {
        id: learner.learner.id,
        name: learner.learner.name,
        login: learner.learner.login,
        email: learner.learner.email,
        departmentName: learner.learner.department?.name ?? "Без подразделения",
        assignedCoursesCount: learner.assignedCoursesCount,
        completedCoursesCount: learner.completedCoursesCount,
        averageProgressPercent: learner.averageProgressPercent,
        statusLabel: selectedCourseSnapshot
          ? selectedCourseSnapshot.statusLabel
          : getAggregateStatusLabel(learner.assignedCoursesCount, learner.completedCoursesCount, learner.averageProgressPercent),
        lastActivityAt: learner.lastActivityAt,
        selectedCourseTitle,
        selectedCourseProgressPercent: selectedCourseSnapshot?.progressPercent ?? null,
        selectedCourseStatusLabel: selectedCourseSnapshot?.statusLabel ?? null,
        courseTitles: learner.courseTitles,
      };
    }),
    comparisonRows,
  };
}

export function buildGroupProgressCsv(data: GroupProgressReportData) {
  const rows = buildGroupProgressRows(data);
  return `\uFEFF${rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(";"))
    .join("\n")}`;
}

export function buildGroupProgressXlsx(data: GroupProgressReportData) {
  return buildXlsxWorkbook({
    sheetName: "Прогресс группы",
    rows: buildGroupProgressRows(data),
  });
}

function isEligibleGroupLearner(user: GroupMemberUser) {
  const roleNames = new Set([user.role, ...user.userRoles.map((item) => item.roleProfile.name)].filter(Boolean));
  return roleNames.has(STANDARD_ROLE_NAMES.STUDENT) && !isAccessRevokedUserStatus(user.status);
}

function buildGroupProgressRows(data: GroupProgressReportData) {
  const rows: Array<Array<string | number>> = [
    ["Группа", data.group.name],
    ["Курс", data.courseFilter.selectedCourseTitle ?? "Все назначенные курсы группы"],
    ["Активные ученики", data.summary.learnersCount],
    ["Курсы в отчете", data.summary.assignedCoursesCount],
    ["Завершили", data.summary.completedLearnersCount],
    ["Средний прогресс, %", data.summary.avgProgressPercent],
    [],
    data.courseFilter.selectedCourseId
      ? ["Ученик", "Логин", "Email", "Подразделение", "Прогресс, %", "Статус", "Последняя активность"]
      : [
          "Ученик",
          "Логин",
          "Email",
          "Подразделение",
          "Назначено курсов",
          "Завершено курсов",
          "Средний прогресс, %",
          "Статус",
          "Курсы",
          "Последняя активность",
        ],
  ];

  for (const learner of data.learners) {
    if (data.courseFilter.selectedCourseId) {
      rows.push([
        learner.name,
        learner.login,
        learner.email ?? "",
        learner.departmentName,
        learner.selectedCourseProgressPercent ?? 0,
        learner.selectedCourseStatusLabel ?? learner.statusLabel,
        learner.lastActivityAt ? formatDateTimeRu(learner.lastActivityAt) : "",
      ]);
      continue;
    }

    rows.push([
      learner.name,
      learner.login,
      learner.email ?? "",
      learner.departmentName,
      learner.assignedCoursesCount,
      learner.completedCoursesCount,
      learner.averageProgressPercent,
      learner.statusLabel,
      learner.courseTitles.join(", "),
      learner.lastActivityAt ? formatDateTimeRu(learner.lastActivityAt) : "",
    ]);
  }

  if (data.comparisonRows.length > 0) {
    rows.push([]);
    rows.push(["Сравнение групп"]);
    rows.push(["Группа", "Ученики", "Курсы", "Завершили", "Средний прогресс, %"]);
    for (const row of data.comparisonRows) {
      rows.push([
        row.groupName,
        row.learnersCount,
        row.assignedCoursesCount,
        row.completedLearnersCount,
        row.avgProgressPercent,
      ]);
    }
  }

  return rows;
}

function dedupeCourseOptions(values: Array<{ id: string; title: string }>) {
  return Array.from(new Map(values.map((value) => [value.id, value] as const)).values()).sort((left, right) =>
    left.title.localeCompare(right.title, "ru", { sensitivity: "base", numeric: true })
  );
}

function resolveGroupCourseIds(group: GroupSeed, selectedCourseId: string) {
  if (selectedCourseId) {
    return group.courseOptions.some((course) => course.id === selectedCourseId) ? [selectedCourseId] : [];
  }
  return group.courseOptions.map((course) => course.id);
}

function buildGroupLearnerAggregates(
  group: GroupSeed,
  courseById: Map<string, CourseSnapshot>,
  selectedCourseId: string
) {
  const relevantCourses = group.courseOptions.filter((course) =>
    selectedCourseId ? course.id === selectedCourseId : true
  );

  return group.learners
    .map<GroupLearnerAggregate>((learner) => {
      const snapshotsByCourseId = new Map<string, LearnerCourseSnapshot>();

      for (const course of relevantCourses) {
        snapshotsByCourseId.set(course.id, getLearnerCourseSnapshot(courseById.get(course.id), learner.id));
      }

      const snapshots = Array.from(snapshotsByCourseId.values());
      const lastActivityAt = snapshots.reduce<Date | null>((latest, snapshot) => {
        if (!snapshot.lastActivityAt) return latest;
        return !latest || snapshot.lastActivityAt.getTime() > latest.getTime() ? snapshot.lastActivityAt : latest;
      }, null);

      return {
        learner,
        assignedCoursesCount: relevantCourses.length,
        completedCoursesCount: snapshots.filter((snapshot) => snapshot.isCompleted).length,
        averageProgressPercent: roundPercent(
          snapshots.length ? snapshots.reduce((sum, snapshot) => sum + snapshot.progressPercent, 0) / snapshots.length : 0
        ),
        lastActivityAt,
        courseTitles: relevantCourses.map((course) => course.title),
        snapshotsByCourseId,
      };
    })
    .sort((left, right) => left.learner.name.localeCompare(right.learner.name, "ru", { sensitivity: "base", numeric: true }));
}

function getLearnerCourseSnapshot(course: CourseSnapshot | undefined, learnerId: string): LearnerCourseSnapshot {
  if (!course) {
    return {
      progressPercent: 0,
      isCompleted: false,
      statusLabel: "Не начат",
      lastActivityAt: null,
    };
  }

  const materialViewsByItemId = new Map<
    string,
    {
      progressPercent: number;
      viewedAt: Date;
    }
  >();
  const quizAttemptsByQuizId = new Map<
    string,
    Array<{
      outcome: string;
      correctAnswers: number;
      attemptNumber: number;
      score: number;
      completedAt: Date;
    }>
  >();

  for (const item of course.items) {
    for (const view of item.views) {
      if (view.userId !== learnerId) continue;
      const existing = materialViewsByItemId.get(item.id);
      if (
        !existing ||
        view.progressPercent > existing.progressPercent ||
        view.viewedAt.getTime() > existing.viewedAt.getTime()
      ) {
        materialViewsByItemId.set(item.id, {
          progressPercent: view.progressPercent,
          viewedAt: view.viewedAt,
        });
      }
    }

    if (!item.quiz) continue;
    const attempts = item.quiz.attempts.filter((attempt) => attempt.userId === learnerId);
    if (attempts.length > 0) {
      quizAttemptsByQuizId.set(item.quiz.id, attempts);
    }
  }

  const progress = getCourseProgress({
    courseTitle: course.title,
    courseDescription: course.description,
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
    items: course.items.map((item) => ({
      id: item.id,
      type: item.type,
      isRequired: item.isRequired,
      viewed: item.type === "QUIZ" ? false : materialViewsByItemId.has(item.id),
      materialProgress: materialViewsByItemId.get(item.id)?.progressPercent ?? 0,
      quiz: item.quiz
        ? {
            maxAttempts: item.quiz.maxAttempts,
            minCorrectAnswers: item.quiz.minCorrectAnswers,
            attempts: quizAttemptsByQuizId.get(item.quiz.id) ?? [],
          }
        : null,
    })),
  });

  const lastActivityCandidates = [
    ...Array.from(materialViewsByItemId.values()).map((view) => view.viewedAt),
    ...Array.from(quizAttemptsByQuizId.values()).flatMap((attempts) => attempts.map((attempt) => attempt.completedAt)),
  ];
  const lastActivityAt =
    lastActivityCandidates.length > 0
      ? new Date(Math.max(...lastActivityCandidates.map((value) => value.getTime())))
      : null;

  return {
    progressPercent: progress.percent,
    isCompleted: progress.isCompleted,
    statusLabel: getCourseProgressStatusLabel(progress.percent, progress.isCompleted),
    lastActivityAt,
  };
}

function getCourseProgressStatusLabel(progressPercent: number, isCompleted: boolean) {
  if (isCompleted) return "Завершен";
  if (progressPercent > 0) return "В обучении";
  return "Не начат";
}

function getAggregateStatusLabel(assignedCoursesCount: number, completedCoursesCount: number, averageProgressPercent: number) {
  if (assignedCoursesCount === 0) return "Нет курсов";
  if (completedCoursesCount === assignedCoursesCount) return "Завершил все";
  if (averageProgressPercent > 0 || completedCoursesCount > 0) return "В обучении";
  return "Не начал";
}

function roundPercent(value: number) {
  return Number(value.toFixed(1));
}

function formatDateTimeRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function escapeCsvCell(value: string | number | null | undefined) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[;"\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
