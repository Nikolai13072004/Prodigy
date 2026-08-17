import { getCourseProgress, getQuizProgress } from "@/lib/course-progress";
import prisma from "@/lib/prisma";
import { ROLES } from "@/lib/roles";
import { USER_STATUS_LABELS, isUserStatus } from "@/lib/users";

type CourseAssignmentSeed = {
  assignedAtCandidates: Date[];
  assignedGroupNames: Set<string>;
};

export type LearnerReportCourseRow = {
  id: string;
  title: string;
  progressPercent: number;
  completedRequired: number;
  requiredTotal: number;
  requiredQuizStatus:
    | "NO_TEST"
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "PENDING_REVIEW"
    | "PASSED"
    | "FAILED";
  requiredQuizStatusLabel: string;
  state: "completed" | "in_progress" | "not_started";
  stateLabel: string;
  assignedAt: Date | null;
  lastActivityAt: Date | null;
  assignedGroups: string[];
};

export type LearnerCommunicationRow = {
  id: string;
  type:
    | "course_assigned"
    | "course_broadcast"
    | "course_invite"
    | "quiz_reviewed"
    | "student_invite"
    | "user_activation"
    | "user_access_created"
    | "user_access_password_reset";
  typeLabel: string;
  subject: string;
  summary: string;
  status: string;
  statusLabel: string;
  createdAt: Date;
  sentAt: Date | null;
  communicationAt: Date;
};

export type LearnerCommunicationFilterType = "all" | LearnerCommunicationRow["type"];

export type LearnerTimelineRow = {
  id: string;
  type:
    | "assignment"
    | "material_view"
    | "quiz_attempt"
    | "feedback"
    | "communication"
    | "account";
  typeLabel: string;
  title: string;
  summary: string;
  occurredAt: Date;
  href: string | null;
};

export type LearnerCommunicationFilters = {
  type: LearnerCommunicationFilterType;
  dateFrom: string;
  dateTo: string;
};

export const LEARNER_COMMUNICATION_TYPE_OPTIONS: Array<{
  value: LearnerCommunicationFilterType;
  label: string;
}> = [
  { value: "all", label: "Все типы" },
  { value: "course_assigned", label: "Назначение на курс" },
  { value: "course_broadcast", label: "Массовая рассылка" },
  { value: "course_invite", label: "Приглашение на курс" },
  { value: "quiz_reviewed", label: "Проверка задания" },
  { value: "student_invite", label: "Временный пароль" },
  { value: "user_activation", label: "Активация аккаунта" },
  { value: "user_access_created", label: "Доступ к аккаунту" },
  { value: "user_access_password_reset", label: "Сброс пароля" },
];

export type LearnerReportDetailData = {
  learner: {
    id: string;
    name: string;
    login: string;
    email: string | null;
    avatarUrl: string | null;
    accountStatus: string;
    accountStatusLabel: string;
    department: string;
    groups: string[];
    createdAt: Date;
    lastLoginAt: Date | null;
  };
  summary: {
    assignedCoursesCount: number;
    completedCoursesCount: number;
    inProgressCoursesCount: number;
    notStartedCoursesCount: number;
    averageProgressPercent: number;
  };
  courses: LearnerReportCourseRow[];
  communications: LearnerCommunicationRow[];
  timeline: LearnerTimelineRow[];
};

export async function getLearnerReportDetailData(
  learnerId: string,
  communicationFilters: LearnerCommunicationFilters
): Promise<LearnerReportDetailData | null> {
  const learner = await prisma.user.findFirst({
    where: {
      id: learnerId,
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
    select: {
      id: true,
      name: true,
      login: true,
      email: true,
      avatarUrl: true,
      status: true,
      createdAt: true,
      department: {
        select: { name: true },
      },
      groupMemberships: {
        select: {
          group: {
            select: {
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

  if (!learner) return null;

  const [
    communicationJobs,
    directAssignments,
    groupAssignments,
    itemViews,
    quizAttempts,
    feedbacks,
    accountEvents,
  ] = await Promise.all([
    learner.email
      ? prisma.emailJob.findMany({
          where: {
            toEmail: learner.email,
            template: {
              in: [
                "COURSE_ASSIGNED",
                "COURSE_BROADCAST",
                "COURSE_INVITE",
                "QUIZ_REVIEWED",
                "STUDENT_INVITE",
                "USER_ACTIVATION",
                "USER_ACCESS",
              ],
            },
          },
          select: {
            id: true,
            template: true,
            subject: true,
            status: true,
            payloadJson: true,
            createdAt: true,
            sentAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.courseUserAssignment.findMany({
      where: {
        userId: learnerId,
        course: { status: "PUBLISHED" },
      },
      select: {
        courseId: true,
        assignedAt: true,
        course: {
          select: {
            id: true,
            title: true,
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
              userId: learnerId,
            },
          },
        },
      },
      select: {
        courseId: true,
        assignedAt: true,
        group: {
          select: { name: true },
        },
        course: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.courseItemView.findMany({
      where: { userId: learnerId },
      orderBy: { viewedAt: "desc" },
      take: 60,
      include: {
        courseItem: {
          select: {
            id: true,
            title: true,
            type: true,
            course: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.quizAttempt.findMany({
      where: { userId: learnerId },
      orderBy: { completedAt: "desc" },
      take: 60,
      include: {
        quiz: {
          select: {
            id: true,
            courseItem: {
              select: {
                id: true,
                title: true,
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.courseFeedback.findMany({
      where: { userId: learnerId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        course: { select: { id: true, title: true } },
      },
    }),
    prisma.auditLogEvent.findMany({
      where: {
        objectType: "user",
        objectId: learnerId,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        action: true,
        actorName: true,
        actorLogin: true,
        createdAt: true,
      },
    }),
  ]);

  const communications = communicationJobs
    .map(mapLearnerCommunicationJob)
    .filter((item): item is LearnerCommunicationRow => Boolean(item))
    .filter((item) => matchesLearnerCommunicationFilters(item, communicationFilters))
    .sort((left, right) => right.communicationAt.getTime() - left.communicationAt.getTime());
  const timeline = buildLearnerTimeline({
    learnerId,
    directAssignments,
    groupAssignments,
    itemViews,
    quizAttempts,
    feedbacks,
    accountEvents,
    communications,
  });

  const assignmentsByCourseId = new Map<string, CourseAssignmentSeed>();
  const coursesById = new Map<string, { id: string; title: string }>();

  for (const assignment of directAssignments) {
    coursesById.set(assignment.course.id, assignment.course);
    const seed = assignmentsByCourseId.get(assignment.courseId) ?? {
      assignedAtCandidates: [],
      assignedGroupNames: new Set<string>(),
    };
    seed.assignedAtCandidates.push(assignment.assignedAt);
    assignmentsByCourseId.set(assignment.courseId, seed);
  }

  for (const assignment of groupAssignments) {
    coursesById.set(assignment.course.id, assignment.course);
    const seed = assignmentsByCourseId.get(assignment.courseId) ?? {
      assignedAtCandidates: [],
      assignedGroupNames: new Set<string>(),
    };
    seed.assignedAtCandidates.push(assignment.assignedAt);
    seed.assignedGroupNames.add(assignment.group.name);
    assignmentsByCourseId.set(assignment.courseId, seed);
  }

  const courseIds = Array.from(coursesById.keys());
  if (courseIds.length === 0) {
    return {
      learner: {
        id: learner.id,
        name: learner.name,
        login: learner.login,
        email: learner.email,
        avatarUrl: learner.avatarUrl,
        accountStatus: learner.status,
        accountStatusLabel: getUserStatusLabel(learner.status),
        department: learner.department?.name ?? "Без подразделения",
        groups: learner.groupMemberships
          .map((membership) => membership.group.name)
          .sort((left, right) => left.localeCompare(right, "ru")),
        createdAt: learner.createdAt,
        lastLoginAt: learner.loginEvents[0]?.createdAt ?? null,
      },
      summary: {
        assignedCoursesCount: 0,
        completedCoursesCount: 0,
        inProgressCoursesCount: 0,
        notStartedCoursesCount: 0,
        averageProgressPercent: 0,
      },
      courses: [],
      communications,
      timeline,
    };
  }

  const courses = await prisma.course.findMany({
    where: {
      id: { in: courseIds },
      status: "PUBLISHED",
    },
    orderBy: { title: "asc" },
    include: {
      items: {
        orderBy: { orderIndex: "asc" },
        include: {
          views: {
            where: { userId: learnerId },
            select: {
              progressPercent: true,
              viewedAt: true,
            },
            take: 1,
          },
          quiz: {
            include: {
              attempts: {
                where: { userId: learnerId },
                orderBy: { attemptNumber: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const courseRows = courses.map((course) => {
    const progress = getCourseProgress({
      courseTitle: course.title,
      courseDescription: course.description,
      quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
      items: course.items.map((item) => ({
        ...item,
        viewed: item.type === "QUIZ" ? false : item.views.length > 0,
        materialProgress: item.type === "QUIZ" ? 0 : item.views[0]?.progressPercent ?? 0,
      })),
    });

    const state = getLearnerCourseState(progress);
    const seed = assignmentsByCourseId.get(course.id);
    const assignedAt = seed?.assignedAtCandidates.reduce<Date | null>(
      (earliest, value) => (!earliest || value.getTime() < earliest.getTime() ? value : earliest),
      null
    ) ?? null;
    const lastActivityCandidates = [
      ...course.items.flatMap((item) => item.views.map((view) => view.viewedAt)),
      ...course.items.flatMap((item) => item.quiz?.attempts.map((attempt) => attempt.completedAt) ?? []),
    ];
    const lastActivityAt =
      lastActivityCandidates.length > 0
        ? new Date(Math.max(...lastActivityCandidates.map((value) => value.getTime())))
        : null;
    const requiredQuizStatus = getRequiredQuizStatus(course.items);

    return {
      id: course.id,
      title: course.title,
      progressPercent: progress.percent,
      completedRequired: progress.completedRequired,
      requiredTotal: progress.requiredTotal,
      requiredQuizStatus: requiredQuizStatus.code,
      requiredQuizStatusLabel: requiredQuizStatus.label,
      state,
      stateLabel: getLearnerCourseStateLabel(state),
      assignedAt,
      lastActivityAt,
      assignedGroups: Array.from(seed?.assignedGroupNames ?? []).sort((left, right) =>
        left.localeCompare(right, "ru")
      ),
    };
  }).sort((left, right) => {
    const leftAssignedAt = left.assignedAt?.getTime() ?? 0;
    const rightAssignedAt = right.assignedAt?.getTime() ?? 0;

    if (rightAssignedAt !== leftAssignedAt) {
      return rightAssignedAt - leftAssignedAt;
    }

    return left.title.localeCompare(right.title, "ru");
  });

  const assignedCoursesCount = courseRows.length;
  const completedCoursesCount = courseRows.filter((course) => course.state === "completed").length;
  const inProgressCoursesCount = courseRows.filter((course) => course.state === "in_progress").length;
  const notStartedCoursesCount = courseRows.filter((course) => course.state === "not_started").length;
  const averageProgressPercent = assignedCoursesCount
    ? Math.round(courseRows.reduce((sum, course) => sum + course.progressPercent, 0) / assignedCoursesCount)
    : 0;

  return {
    learner: {
      id: learner.id,
      name: learner.name,
      login: learner.login,
      email: learner.email,
      avatarUrl: learner.avatarUrl,
      accountStatus: learner.status,
      accountStatusLabel: getUserStatusLabel(learner.status),
      department: learner.department?.name ?? "Без подразделения",
      groups: learner.groupMemberships
        .map((membership) => membership.group.name)
        .sort((left, right) => left.localeCompare(right, "ru")),
      createdAt: learner.createdAt,
      lastLoginAt: learner.loginEvents[0]?.createdAt ?? null,
    },
    summary: {
      assignedCoursesCount,
      completedCoursesCount,
      inProgressCoursesCount,
      notStartedCoursesCount,
      averageProgressPercent,
    },
    courses: courseRows,
    communications,
    timeline,
  };
}

function buildLearnerTimeline(args: {
  learnerId: string;
  directAssignments: Array<{
    courseId: string;
    assignedAt: Date;
    course: { id: string; title: string };
  }>;
  groupAssignments: Array<{
    courseId: string;
    assignedAt: Date;
    group: { name: string };
    course: { id: string; title: string };
  }>;
  itemViews: Array<{
    id: string;
    progressPercent: number;
    viewedAt: Date;
    courseItem: {
      id: string;
      title: string;
      type: string;
      course: { id: string; title: string };
    };
  }>;
  quizAttempts: Array<{
    id: string;
    attemptNumber: number;
    outcome: string;
    correctAnswers: number;
    totalQuestions: number;
    completedAt: Date;
    quiz: {
      id: string;
      courseItem: {
        id: string;
        title: string;
        course: { id: string; title: string };
      };
    };
  }>;
  feedbacks: Array<{
    id: string;
    rating: number;
    status: string;
    createdAt: Date;
    course: { id: string; title: string };
  }>;
  accountEvents: Array<{
    id: string;
    action: string;
    actorName: string | null;
    actorLogin: string | null;
    createdAt: Date;
  }>;
  communications: LearnerCommunicationRow[];
}): LearnerTimelineRow[] {
  const rows: LearnerTimelineRow[] = [
    ...args.directAssignments.map((assignment) => ({
      id: `direct-${assignment.courseId}`,
      type: "assignment" as const,
      typeLabel: "Назначение",
      title: `Назначен курс «${assignment.course.title}»`,
      summary: "Индивидуальное назначение курса.",
      occurredAt: assignment.assignedAt,
      href: `/courses/${assignment.course.id}/learners/${args.learnerId}`,
    })),
    ...args.groupAssignments.map((assignment) => ({
      id: `group-${assignment.courseId}-${assignment.group.name}`,
      type: "assignment" as const,
      typeLabel: "Назначение",
      title: `Назначен курс «${assignment.course.title}»`,
      summary: `Назначение через группу «${assignment.group.name}».`,
      occurredAt: assignment.assignedAt,
      href: `/courses/${assignment.course.id}/learners/${args.learnerId}`,
    })),
    ...args.itemViews.map((view) => ({
      id: view.id,
      type: "material_view" as const,
      typeLabel: "Материал",
      title: `Открыт материал «${view.courseItem.title}»`,
      summary: `${view.courseItem.course.title} · прогресс ${view.progressPercent}%`,
      occurredAt: view.viewedAt,
      href: `/courses/${view.courseItem.course.id}?item=${view.courseItem.id}&view=content`,
    })),
    ...args.quizAttempts.map((attempt) => ({
      id: attempt.id,
      type: "quiz_attempt" as const,
      typeLabel: "Тест",
      title: `Попытка ${attempt.attemptNumber}: ${attempt.quiz.courseItem.title}`,
      summary: `${attempt.quiz.courseItem.course.title} · ${getQuizOutcomeLabel(attempt.outcome)} · ${attempt.correctAnswers}/${attempt.totalQuestions}`,
      occurredAt: attempt.completedAt,
      href: `/courses/${attempt.quiz.courseItem.course.id}/quiz/${attempt.quiz.id}/result?attempt=${attempt.id}`,
    })),
    ...args.feedbacks.map((feedback) => ({
      id: feedback.id,
      type: "feedback" as const,
      typeLabel: "Отзыв",
      title: `Оставлен отзыв по курсу «${feedback.course.title}»`,
      summary: `Оценка ${feedback.rating}/5 · ${feedback.status === "PENDING" ? "на модерации" : "опубликован"}`,
      occurredAt: feedback.createdAt,
      href: `/courses/${feedback.course.id}/manage?section=feedback`,
    })),
    ...args.communications.map((communication) => ({
      id: communication.id,
      type: "communication" as const,
      typeLabel: "Письмо",
      title: communication.subject,
      summary: `${communication.typeLabel} · ${communication.statusLabel}`,
      occurredAt: communication.communicationAt,
      href: null,
    })),
    ...args.accountEvents.map((event) => ({
      id: event.id,
      type: "account" as const,
      typeLabel: "Аккаунт",
      title: getAccountEventTitle(event.action),
      summary: event.actorName || event.actorLogin ? `Инициатор: ${event.actorName ?? event.actorLogin}` : "Системное событие",
      occurredAt: event.createdAt,
      href: null,
    })),
  ];

  return rows.sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()).slice(0, 120);
}

function getQuizOutcomeLabel(outcome: string) {
  if (outcome === "PASSED") return "сдан";
  if (outcome === "FAILED") return "не сдан";
  if (outcome === "PENDING_REVIEW") return "на проверке";
  if (outcome === "IN_PROGRESS") return "в работе";
  return outcome;
}

function getAccountEventTitle(action: string) {
  if (action === "users:create") return "Пользователь создан";
  if (action === "users:update") return "Профиль пользователя обновлен";
  if (action === "users:archive") return "Пользователь архивирован";
  if (action === "users:restore") return "Пользователь восстановлен";
  if (action === "users:reset_password") return "Сброшен пароль";
  if (action === "users:send_invite") return "Отправлено приглашение";
  return action;
}

function getLearnerCourseState(
  progress: ReturnType<typeof getCourseProgress>
): LearnerReportCourseRow["state"] {
  if (progress.requiredTotal > 0 && progress.completedRequired >= progress.requiredTotal) return "completed";
  if (progress.percent > 0) return "in_progress";
  return "not_started";
}

function getLearnerCourseStateLabel(state: "completed" | "in_progress" | "not_started") {
  if (state === "completed") return "Завершен";
  if (state === "in_progress") return "В обучении";
  return "Не начат";
}

function getRequiredQuizStatus(
  items: Array<{
    type: string;
    isRequired: boolean;
    quiz: {
      maxAttempts: number;
      minCorrectAnswers: number;
      attempts: Array<{
        outcome: string;
        correctAnswers: number;
        attemptNumber: number;
        score: number;
        completedAt: Date;
      }>;
    } | null;
  }>
): {
  code: LearnerReportCourseRow["requiredQuizStatus"];
  label: string;
} {
  const requiredQuizItems = items.filter((item) => item.isRequired && item.type === "QUIZ" && item.quiz);

  if (requiredQuizItems.length === 0) {
    return { code: "NO_TEST", label: "Нет теста" };
  }

  const quizStatuses = requiredQuizItems.map((item) => getQuizProgress(item.quiz!, item.quiz!.attempts).status.code);

  if (quizStatuses.every((status) => status === "PASSED")) {
    return { code: "PASSED", label: "Сдан" };
  }
  if (quizStatuses.some((status) => status === "FAILED")) {
    return { code: "FAILED", label: "Не сдан" };
  }
  if (quizStatuses.some((status) => status === "PENDING_REVIEW")) {
    return { code: "PENDING_REVIEW", label: "На проверке" };
  }
  if (quizStatuses.some((status) => status === "IN_PROGRESS")) {
    return { code: "IN_PROGRESS", label: "В работе" };
  }

  return { code: "NOT_STARTED", label: "Не начат" };
}

function getUserStatusLabel(status: string) {
  return isUserStatus(status) ? USER_STATUS_LABELS[status] : status;
}

function mapLearnerCommunicationJob(job: {
  id: string;
  template: string | null;
  subject: string;
  status: string;
  payloadJson: string | null;
  createdAt: Date;
  sentAt: Date | null;
}): LearnerCommunicationRow | null {
  const payload = parsePayloadJson(job.payloadJson);
  const communicationAt = job.sentAt ?? job.createdAt;

  switch (job.template) {
    case "COURSE_ASSIGNED": {
      const courseTitle = readString(payload, "courseTitle");
      return {
        id: job.id,
        type: "course_assigned",
        typeLabel: "Назначение на курс",
        subject: job.subject,
        summary: courseTitle
          ? `Ученику отправлено письмо о назначении курса «${courseTitle}».`
          : "Ученику отправлено письмо о новом назначенном курсе.",
        status: job.status,
        statusLabel: getEmailJobStatusLabel(job.status),
        createdAt: job.createdAt,
        sentAt: job.sentAt,
        communicationAt,
      };
    }
    case "COURSE_BROADCAST": {
      const courseTitle = readString(payload, "courseTitle");
      const messageBody = readString(payload, "messageBody");
      const groupName = readString(payload, "groupName");
      return {
        id: job.id,
        type: "course_broadcast",
        typeLabel: "Массовая рассылка",
        subject: job.subject,
        summary: courseTitle
          ? `${groupName ? `Группе «${groupName}»` : "Ученикам"} отправлено сообщение по курсу «${courseTitle}».${
              messageBody ? ` ${truncateText(messageBody, 180)}` : ""
            }`
          : truncateText(messageBody || "Ученику отправлено массовое сообщение по курсу.", 220),
        status: job.status,
        statusLabel: getEmailJobStatusLabel(job.status),
        createdAt: job.createdAt,
        sentAt: job.sentAt,
        communicationAt,
      };
    }
    case "COURSE_INVITE": {
      const courseTitle = readString(payload, "courseTitle");
      const accessExpiresAt = readDate(payload, "accessExpiresAt");
      return {
        id: job.id,
        type: "course_invite",
        typeLabel: "Приглашение на курс",
        subject: job.subject,
        summary: courseTitle
          ? `Ученику отправлено приглашение на курс «${courseTitle}»${
              accessExpiresAt ? ` с доступом до ${formatDateRu(accessExpiresAt)}.` : "."
            }`
          : "Ученику отправлено приглашение на курс.",
        status: job.status,
        statusLabel: getEmailJobStatusLabel(job.status),
        createdAt: job.createdAt,
        sentAt: job.sentAt,
        communicationAt,
      };
    }
    case "QUIZ_REVIEWED": {
      const courseTitle = readString(payload, "courseTitle");
      const quizTitle = readString(payload, "quizTitle");
      const reviewComment = readString(payload, "reviewComment");
      const outcome = readString(payload, "outcome");

      return {
        id: job.id,
        type: "quiz_reviewed",
        typeLabel: "Проверка задания",
        subject: job.subject,
        summary: courseTitle
          ? `По курсу «${courseTitle}» проверена работа «${quizTitle || "Задание"}».${
              reviewComment ? ` ${truncateText(reviewComment, 180)}` : outcome === "PASSED" ? " Результат: зачет." : ""
            }`
          : truncateText(reviewComment || "Проверено задание с ручной проверкой.", 220),
        status: job.status,
        statusLabel: getEmailJobStatusLabel(job.status),
        createdAt: job.createdAt,
        sentAt: job.sentAt,
        communicationAt,
      };
    }
    case "STUDENT_INVITE":
      return {
        id: job.id,
        type: "student_invite",
        typeLabel: "Временный пароль",
        subject: job.subject,
        // Не показываем raw textBody: там есть временный пароль.
        summary: "Ученику отправлено письмо с временными данными для первого входа на платформу.",
        status: job.status,
        statusLabel: getEmailJobStatusLabel(job.status),
        createdAt: job.createdAt,
        sentAt: job.sentAt,
        communicationAt,
      };
    case "USER_ACTIVATION":
      return {
        id: job.id,
        type: "user_activation",
        typeLabel: "Активация аккаунта",
        subject: job.subject,
        // Не показываем raw textBody: там есть одноразовая ссылка активации.
        summary: "Ученику отправлено письмо со ссылкой для активации аккаунта.",
        status: job.status,
        statusLabel: getEmailJobStatusLabel(job.status),
        createdAt: job.createdAt,
        sentAt: job.sentAt,
        communicationAt,
      };
    case "USER_ACCESS": {
      const reason = readString(payload, "reason");
      if (reason === "PASSWORD_RESET") {
        return {
          id: job.id,
          type: "user_access_password_reset",
          typeLabel: "Сброс пароля",
          subject: job.subject,
          // Не показываем raw textBody: там есть временный пароль.
          summary: "Ученику отправлено письмо со сбросом пароля и временными данными для входа.",
          status: job.status,
          statusLabel: getEmailJobStatusLabel(job.status),
          createdAt: job.createdAt,
          sentAt: job.sentAt,
          communicationAt,
        };
      }

      return {
        id: job.id,
        type: "user_access_created",
        typeLabel: "Доступ к аккаунту",
        subject: job.subject,
        // Не показываем raw textBody: там есть временный пароль.
        summary: "Ученику отправлено письмо с временными данными для входа в аккаунт.",
        status: job.status,
        statusLabel: getEmailJobStatusLabel(job.status),
        createdAt: job.createdAt,
        sentAt: job.sentAt,
        communicationAt,
      };
    }
    default:
      return null;
  }
}

function matchesLearnerCommunicationFilters(
  communication: LearnerCommunicationRow,
  filters: LearnerCommunicationFilters
) {
  if (filters.type !== "all" && communication.type !== filters.type) return false;

  const dateFrom = parseDateBoundary(filters.dateFrom, "start");
  if (dateFrom && communication.communicationAt.getTime() < dateFrom.getTime()) return false;

  const dateTo = parseDateBoundary(filters.dateTo, "end");
  if (dateTo && communication.communicationAt.getTime() > dateTo.getTime()) return false;

  return true;
}

function parsePayloadJson(payloadJson: string | null): Record<string, unknown> {
  if (!payloadJson) return {};

  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readDate(payload: Record<string, unknown>, key: string) {
  const raw = readString(payload, key);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEmailJobStatusLabel(status: string) {
  if (status === "SENT") return "Отправлено";
  if (status === "PROCESSING") return "Отправляется";
  if (status === "FAILED") return "Ошибка отправки";
  if (status === "PENDING") return "В очереди";
  return status;
}

function parseDateBoundary(value: string, boundary: "start" | "end") {
  const normalized = value.trim();
  if (!normalized) return null;

  const parsed = new Date(`${normalized}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
