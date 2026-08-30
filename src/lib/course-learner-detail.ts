import { canManageCourse } from "@/lib/access";
import { resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import { getBestAttempt, getCourseProgress, getQuizProgress } from "@/lib/course-progress";
import { getRequiredCorrectAnswers } from "@/lib/quiz-pass-rule";
import { isManualReviewQuestion } from "@/lib/quiz-manual-review";
import prisma from "@/lib/prisma";
import { PERMISSIONS, canAccessAllCourses, hasPermission, isPlatformAdminRole } from "@/lib/roles";
import { USER_STATUS_LABELS, isUserStatus } from "@/lib/users";

type SessionUserLike = {
  id: string;
  roles: string[];
  permissions: string[];
};

type QuizAttemptDetail = {
  id: string;
  quizTitle: string;
  assessmentKindLabel: string;
  attemptNumber: number;
  score: number;
  maxScore: number;
  scorePercent: number;
  correctAnswers: number;
  requiredCorrectAnswers: number;
  totalQuestions: number;
  completedAt: Date;
  outcome: string;
  outcomeLabel: string;
  reviewStatusLabel: string | null;
  reviewComment: string | null;
};

type CourseItemDetail = {
  id: string;
  type: string;
  title: string;
  isRequired: boolean;
  progressPercent: number;
  statusLabel: string;
  viewedAt: Date | null;
  quizSummary: {
    attemptsUsed: number;
    attemptsLeft: number;
    bestScore: number;
    maxScore: number;
    bestScorePercent: number;
    lastAttemptAt: Date | null;
    statusLabel: string;
  } | null;
};

type AssessmentDetail = {
  id: string;
  title: string;
  assessmentKindLabel: string;
  latestAttemptNumber: number | null;
  latestAttemptAt: Date | null;
  latestScore: number | null;
  latestMaxScore: number;
  latestScorePercent: number | null;
  latestCorrectAnswers: number | null;
  requiredCorrectAnswers: number;
  totalQuestions: number;
  latestOutcomeLabel: string;
  reviewStatusLabel: string | null;
  reviewComment: string | null;
};

type CourseAccessAuditDetail = {
  changedAt: Date;
  actorName: string;
  previousAccessLabel: string;
  nextAccessLabel: string;
};

export type CourseLearnerDetailData = {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    publishedAt: Date | null;
    updatedAt: Date;
  };
  learner: {
    id: string;
    name: string;
    login: string;
    email: string | null;
    department: string;
    groups: string[];
    accountStatus: string;
    accountStatusLabel: string;
    assignedAt: Date | null;
    assignmentSource: string;
    assignedGroups: string[];
    accessExpiresAt: Date | null;
    accessState: "active" | "expired";
    accessStateLabel: string;
    hasUnlimitedAccess: boolean;
    lastActivityAt: Date | null;
  };
  access: {
    canEditCourse: boolean;
    canPublishCourse: boolean;
    canManageAssignments: boolean;
    canViewReports: boolean;
    canViewLearners: boolean;
    canViewResults: boolean;
    canOpenManage: boolean;
  };
  accessAudit: CourseAccessAuditDetail | null;
  progress: ReturnType<typeof getCourseProgress>;
  itemDetails: CourseItemDetail[];
  assessmentDetails: AssessmentDetail[];
  attemptHistory: QuizAttemptDetail[];
};

export async function getCourseLearnerDetailData(args: {
  courseId: string;
  learnerId: string;
  user: SessionUserLike;
}): Promise<CourseLearnerDetailData | null> {
  const { courseId, learnerId, user } = args;

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
        where: { userId: learnerId },
        select: { assignedAt: true, expiresAt: true },
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
                where: { userId: learnerId },
                select: { userId: true },
              },
            },
          },
        },
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
  const canViewResults = canViewLearners;

  const access = {
    canEditCourse,
    canPublishCourse,
    canManageAssignments,
    canViewReports,
    canViewLearners,
    canViewResults,
    canOpenManage: canEditCourse || canPublishCourse || canManageAssignments,
  };

  const assignedGroups = course.groupAssignments
    .filter((assignment) => assignment.group.memberships.length > 0)
    .map((assignment) => ({
      name: assignment.group.name,
      assignedAt: assignment.assignedAt,
      expiresAt: assignment.expiresAt,
    }));
  const hasDirectAssignment = course.directAssignments.length > 0;
  const hasGroupAssignment = assignedGroups.length > 0;

  if (!hasDirectAssignment && !hasGroupAssignment) {
    return null;
  }

  const learner = await prisma.user.findUnique({
    where: { id: learnerId },
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
              name: true,
            },
          },
        },
      },
    },
  });

  if (!learner) return null;

  const accessAuditEvent = await prisma.auditLogEvent.findFirst({
    where: {
      action: "courses:update_access",
      objectId: `${courseId}:${learnerId}`,
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      actorName: true,
      actorLogin: true,
      metadataJson: true,
    },
  });

  const courseItems = await prisma.courseItem.findMany({
    where: { courseId },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      type: true,
      title: true,
      isRequired: true,
      views: {
        where: { userId: learnerId },
        select: {
          progressPercent: true,
          viewedAt: true,
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
            where: { userId: learnerId },
            orderBy: { attemptNumber: "asc" },
            select: {
              id: true,
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

  const progress = getCourseProgress({
    courseTitle: course.title,
    courseDescription: course.description,
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
    items: courseItems.map((item) => {
      const materialProgress = item.views[0]?.progressPercent ?? 0;
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
              attempts: item.quiz.attempts,
            }
          : null,
      };
    }),
  });

  const itemDetails = courseItems.map((item) => {
    const materialProgress = item.views[0]?.progressPercent ?? 0;
    if (item.quiz) {
      const quizProgress = getQuizProgress(item.quiz, item.quiz.attempts);
      const bestAttempt = getBestAttempt(item.quiz.attempts);
      const maxScore = item.quiz.questions.reduce((sum, question) => sum + question.points, 0);
      const lastAttemptAt = item.quiz.attempts.reduce<Date | null>(
        (latest, attempt) =>
          !latest || attempt.completedAt.getTime() > latest.getTime() ? attempt.completedAt : latest,
        null
      );

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        isRequired: item.isRequired,
        progressPercent: quizProgress.isResolved ? 100 : quizProgress.attemptsUsed > 0 || quizProgress.hasInProgress ? 50 : 0,
        statusLabel: getQuizStatusLabel(quizProgress.status.code),
        viewedAt: lastAttemptAt,
        quizSummary: {
          attemptsUsed: quizProgress.attemptsUsed,
          attemptsLeft: quizProgress.attemptsLeft,
          bestScore: bestAttempt?.score ?? 0,
          maxScore,
          bestScorePercent: bestAttempt && bestAttempt.maxScore > 0 ? Math.round((bestAttempt.score / bestAttempt.maxScore) * 100) : 0,
          lastAttemptAt,
          statusLabel: getQuizStatusLabel(quizProgress.status.code),
        },
      };
    }

    return {
      id: item.id,
      type: item.type,
      title: item.title,
      isRequired: item.isRequired,
      progressPercent: materialProgress,
      statusLabel: getMaterialStatusLabel(materialProgress),
      viewedAt: item.views[0]?.viewedAt ?? null,
      quizSummary: null,
    };
  });

  const assessmentDetails = courseItems
    .filter((item) => Boolean(item.quiz))
    .map((item) => {
      const quiz = item.quiz!;
      const latestAttempt = getLatestAssessmentAttempt(quiz.attempts);
      const maxScore = quiz.questions.reduce((sum, question) => sum + question.points, 0);
      const requiredCorrectAnswers = getRequiredCorrectAnswers(quiz.minCorrectAnswers, quiz.questions.length);
      const hasManualReview = quiz.questions.some((question) =>
        isManualReviewQuestion({ type: question.type, config: question.config })
      );

      return {
        id: item.id,
        title: item.title,
        assessmentKindLabel: getAssessmentKindLabel(hasManualReview),
        latestAttemptNumber: latestAttempt?.attemptNumber ?? null,
        latestAttemptAt: latestAttempt?.completedAt ?? null,
        latestScore: latestAttempt?.score ?? null,
        latestMaxScore: latestAttempt?.maxScore ?? maxScore,
        latestScorePercent:
          latestAttempt && latestAttempt.maxScore > 0
            ? Math.round((latestAttempt.score / latestAttempt.maxScore) * 100)
            : null,
        latestCorrectAnswers: latestAttempt?.correctAnswers ?? null,
        requiredCorrectAnswers,
        totalQuestions: quiz.questions.length,
        latestOutcomeLabel: latestAttempt ? getAttemptOutcomeLabel(latestAttempt.outcome) : "Не отправлено",
        reviewStatusLabel: hasManualReview ? getAssessmentReviewStatusLabel(latestAttempt) : null,
        reviewComment: latestAttempt?.reviewComment?.trim() || null,
      };
    });

  const attemptHistory = courseItems
    .flatMap((item) =>
      (item.quiz?.attempts ?? [])
        .filter((attempt) => attempt.outcome !== "IN_PROGRESS")
        .map((attempt) => {
          const hasManualReview = item.quiz!.questions.some((question) =>
            isManualReviewQuestion({ type: question.type, config: question.config })
          );

          return {
            id: attempt.id,
            quizTitle: item.title,
            assessmentKindLabel: getAssessmentKindLabel(hasManualReview),
            attemptNumber: attempt.attemptNumber,
            score: attempt.score,
            maxScore: attempt.maxScore,
            scorePercent: attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0,
            correctAnswers: attempt.correctAnswers,
            requiredCorrectAnswers: getRequiredCorrectAnswers(item.quiz!.minCorrectAnswers, item.quiz!.questions.length),
            totalQuestions: item.quiz!.questions.length,
            completedAt: attempt.completedAt,
            outcome: attempt.outcome,
            outcomeLabel: getAttemptOutcomeLabel(attempt.outcome),
            reviewStatusLabel: hasManualReview ? getAssessmentReviewStatusLabel(attempt) : null,
            reviewComment: attempt.reviewComment?.trim() || null,
          };
        })
    )
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime());

  const lastMaterialActivityAt = itemDetails.reduce<Date | null>(
    (latest, item) =>
      !item.viewedAt || (latest && latest.getTime() >= item.viewedAt.getTime()) ? latest : item.viewedAt,
    null
  );
  const lastActivityAt =
    attemptHistory.length > 0 && (!lastMaterialActivityAt || attemptHistory[0].completedAt.getTime() > lastMaterialActivityAt.getTime())
      ? attemptHistory[0].completedAt
      : lastMaterialActivityAt;

  const assignedAtCandidates = [
    ...course.directAssignments.map((assignment) => assignment.assignedAt),
    ...assignedGroups.map((group) => group.assignedAt),
  ];
  const accessWindow = resolveEffectiveCourseAccessWindow(
    course.directAssignments.map((assignment) => assignment.expiresAt),
    assignedGroups.map((group) => group.expiresAt)
  );
  const assignedAt = assignedAtCandidates.reduce<Date | null>(
    (earliest, value) => (!earliest || value.getTime() < earliest.getTime() ? value : earliest),
    null
  );
  const accessAudit = getCourseAccessAuditDetail(accessAuditEvent);

  return {
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
      publishedAt: course.publishedAt,
      updatedAt: course.updatedAt,
    },
    learner: {
      id: learner.id,
      name: learner.name,
      login: learner.login,
      email: learner.email,
      department: learner.department?.name ?? "Без подразделения",
      groups: learner.groupMemberships.map((membership) => membership.group.name).sort((a, b) => a.localeCompare(b, "ru")),
      accountStatus: learner.status,
      accountStatusLabel: getUserStatusLabel(learner.status),
      assignedAt,
      assignmentSource: getAssignmentSourceLabel(hasDirectAssignment, hasGroupAssignment),
      assignedGroups: assignedGroups.map((group) => group.name).sort((a, b) => a.localeCompare(b, "ru")),
      accessExpiresAt: accessWindow?.expiresAt ?? null,
      accessState: accessWindow?.state ?? "active",
      accessStateLabel: getAccessStateLabel(accessWindow?.state ?? "active", accessWindow?.isUnlimited ?? true),
      hasUnlimitedAccess: accessWindow?.isUnlimited ?? true,
      lastActivityAt,
    },
    access,
    accessAudit,
    progress,
    itemDetails,
    assessmentDetails,
    attemptHistory,
  };
}

function getLatestAssessmentAttempt<
  T extends { outcome: string }
>(attempts: T[]) {
  const completedAttempts = attempts.filter((attempt) => attempt.outcome !== "IN_PROGRESS");
  return completedAttempts.at(-1) ?? attempts.at(-1) ?? null;
}

function getAssignmentSourceLabel(hasDirectAssignment: boolean, hasGroupAssignment: boolean) {
  if (hasDirectAssignment && hasGroupAssignment) return "Напрямую и через группу";
  if (hasDirectAssignment) return "Напрямую";
  return "Через группу";
}

function getUserStatusLabel(status: string) {
  return isUserStatus(status) ? USER_STATUS_LABELS[status] : status;
}

function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function parseAuditMetadata(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function resolveAuditAccessLabel(
  metadata: Record<string, unknown> | null,
  labelKey: "previousAccessLabel" | "nextAccessLabel",
  expiresAtKey: "previousExpiresAt" | "nextExpiresAt"
) {
  const labelValue = metadata?.[labelKey];
  if (typeof labelValue === "string" && labelValue.trim()) {
    return labelValue.trim();
  }

  const expiresAtValue = metadata?.[expiresAtKey];
  if (expiresAtValue === null) return "Бессрочно";
  if (typeof expiresAtValue !== "string" || !expiresAtValue.trim()) return null;

  const parsed = new Date(expiresAtValue);
  if (Number.isNaN(parsed.getTime())) return null;

  return `До ${formatDateRu(parsed)}`;
}

function getCourseAccessAuditDetail(event: {
  createdAt: Date;
  actorName: string | null;
  actorLogin: string | null;
  metadataJson: string | null;
} | null): CourseAccessAuditDetail | null {
  if (!event) return null;

  const metadata = parseAuditMetadata(event.metadataJson);
  const previousAccessLabel = resolveAuditAccessLabel(metadata, "previousAccessLabel", "previousExpiresAt");
  const nextAccessLabel = resolveAuditAccessLabel(metadata, "nextAccessLabel", "nextExpiresAt");

  if (!previousAccessLabel || !nextAccessLabel) return null;

  return {
    changedAt: event.createdAt,
    actorName: event.actorName ?? event.actorLogin ?? "Система",
    previousAccessLabel,
    nextAccessLabel,
  };
}

function getAccessStateLabel(state: "active" | "expired", isUnlimited: boolean) {
  if (state === "active" && isUnlimited) return "Бессрочно";
  if (state === "active") return "Активен";
  return "Истек";
}

function getMaterialStatusLabel(progressPercent: number) {
  if (progressPercent >= 100) return "Завершен";
  if (progressPercent > 0) return "В процессе";
  return "Не начат";
}

function getQuizStatusLabel(status: string) {
  if (status === "PASSED") return "Пройден";
  if (status === "PENDING_REVIEW") return "На проверке";
  if (status === "FAILED") return "Не пройден";
  if (status === "IN_PROGRESS") return "В работе";
  return "Не начат";
}

function getAssessmentKindLabel(hasManualReview: boolean) {
  return hasManualReview ? "Задание" : "Тест";
}

function getAssessmentReviewStatusLabel(
  attempt: { outcome: string; reviewedAt: Date | null; reviewComment: string | null } | null
) {
  if (!attempt) return null;
  if (attempt.outcome === "PENDING_REVIEW") return "На проверке";
  if (attempt.reviewedAt || attempt.reviewComment) return "Проверено";
  return "Проверено";
}

function getAttemptOutcomeLabel(outcome: string) {
  if (outcome === "PASSED") return "Сдан";
  if (outcome === "PENDING_REVIEW") return "На проверке";
  if (outcome === "FAILED") return "Не сдан";
  if (outcome === "ATTEMPTED") return "Опробован";
  return "В работе";
}
