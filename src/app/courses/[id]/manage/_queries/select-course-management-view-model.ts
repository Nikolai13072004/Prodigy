import type { CourseManagementSection } from "./management-load-policy";
import type { CourseManagementData } from "./get-course-management-data";
import { selectCourseAssignmentDirectory } from "./select-course-assignments";
import { selectCourseSurveyViewModel } from "./select-course-survey";

export type CourseManagementTab = {
  key: CourseManagementSection;
  label: string;
};

export type CourseAttentionCard = {
  title: string;
  value: number;
  description: string;
  href: string;
};

export function selectCourseManagementViewModel(args: {
  courseId: string;
  course: NonNullable<CourseManagementData["course"]>;
  activeSection: CourseManagementSection;
  permissions: {
    canEditCourse: boolean;
    canOpenAccessSection: boolean;
    canOpenAssignmentsSection: boolean;
  };
  users: CourseManagementData["allUsers"];
  groups: CourseManagementData["allGroups"];
  counters: {
    pendingReviewCount: number;
    pendingFeedbackCount: number;
    failedEmailCount: number;
    feedbackCount: number;
  };
  navigation: {
    fromUser?: string;
    messaging?: string;
    messageError?: string;
  };
  now?: Date;
}) {
  const { course, permissions } = args;

  return {
    shell: {
      returnUserId: normalizeReturnUserId(args.navigation.fromUser),
      tabs: selectCourseManagementTabs(args.activeSection, permissions),
      attentionCards: buildCourseAttentionCards({
        courseId: args.courseId,
        pendingReviewCount: permissions.canEditCourse ? args.counters.pendingReviewCount : 0,
        pendingFeedbackCount: permissions.canEditCourse ? args.counters.pendingFeedbackCount : 0,
        failedEmailCount: permissions.canEditCourse ? args.counters.failedEmailCount : 0,
        expiringAssignmentCount: permissions.canOpenAssignmentsSection
          ? countExpiringAssignments(
              [
                ...course.directAssignments.map((assignment) => assignment.expiresAt),
                ...course.groupAssignments.map((assignment) => assignment.expiresAt),
                ...course.invites.map((invite) => invite.accessExpiresAt),
              ],
              args.now
            )
          : 0,
      }),
      course: {
        title: course.title,
        description: course.description,
        status: course.status,
        itemCount: course.items.length,
        assignmentCount: course.directAssignments.length + course.groupAssignments.length,
        feedbackCount: args.counters.feedbackCount,
      },
    },
    assignments: args.activeSection === "assignments"
      ? {
          directory: selectCourseAssignmentDirectory({ users: args.users, groups: args.groups, course }),
          messagingOpen: args.navigation.messaging === "1" || Boolean(args.navigation.messageError),
        }
      : null,
    survey: args.activeSection === "survey"
      ? selectCourseSurveyViewModel(course.surveyTemplate)
      : null,
  };
}

export function selectCourseManagementTabs(
  activeSection: CourseManagementSection,
  permissions: {
    canEditCourse: boolean;
    canOpenAccessSection: boolean;
    canOpenAssignmentsSection: boolean;
  }
) {
  const tabs: Array<CourseManagementTab & { visible: boolean }> = [
    { key: "structure", label: "Структура", visible: permissions.canEditCourse },
    { key: "basics", label: "Основные", visible: permissions.canEditCourse },
    { key: "access", label: "Управление доступом", visible: permissions.canOpenAccessSection },
    { key: "assignments", label: "Назначения", visible: permissions.canOpenAssignmentsSection },
    { key: "reports", label: "Отчеты", visible: permissions.canEditCourse },
    { key: "reviews", label: "Задания на проверку", visible: permissions.canEditCourse },
    { key: "feedback", label: "Отзывы", visible: permissions.canEditCourse },
    { key: "survey", label: "Опрос курса", visible: permissions.canEditCourse && activeSection === "survey" },
  ];

  return tabs.filter((tab) => tab.visible).map(({ key, label }) => ({ key, label }));
}

export function buildCourseAttentionCards(args: {
  courseId: string;
  pendingReviewCount: number;
  pendingFeedbackCount: number;
  failedEmailCount: number;
  expiringAssignmentCount: number;
}) {
  const cards: CourseAttentionCard[] = [];

  if (args.pendingReviewCount > 0) {
    cards.push({
      title: "Задания на проверку",
      value: args.pendingReviewCount,
      description: "Есть ответы учеников, которые ждут ручной проверки.",
      href: `/courses/${args.courseId}/manage?section=reviews&reviewStatus=pending`,
    });
  }
  if (args.pendingFeedbackCount > 0) {
    cards.push({
      title: "Отзывы на модерации",
      value: args.pendingFeedbackCount,
      description: "Опубликуйте или оставьте на проверке новые отзывы.",
      href: `/courses/${args.courseId}/manage?section=feedback`,
    });
  }
  if (args.failedEmailCount > 0) {
    cards.push({
      title: "Ошибки отправки",
      value: args.failedEmailCount,
      description: "В очереди есть письма по курсу со статусом ошибки.",
      href: `/admin/reports/email-queue?status=FAILED&q=${encodeURIComponent(args.courseId)}`,
    });
  }
  if (args.expiringAssignmentCount > 0) {
    cards.push({
      title: "Сроки истекают",
      value: args.expiringAssignmentCount,
      description: "Назначения или приглашения закончатся в ближайшие 7 дней.",
      href: `/courses/${args.courseId}/manage?section=assignments`,
    });
  }

  return cards;
}

export function countExpiringAssignments(values: Array<Date | null | undefined>, now = new Date()) {
  const from = now.getTime();
  const through = from + 7 * 24 * 60 * 60 * 1000;
  return values.filter(
    (value) => value instanceof Date && value.getTime() >= from && value.getTime() <= through
  ).length;
}

export function normalizeReturnUserId(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return /^[a-z0-9_-]+$/i.test(normalized) ? normalized : "";
}

export type CourseManagementViewModel = ReturnType<typeof selectCourseManagementViewModel>;
