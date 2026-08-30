import { appBaseUrl } from "@/lib/app-base-url";
import { getCourseProgress } from "@/lib/course-progress";
import { resolveEffectiveCourseAccessWindow } from "@/lib/course-access-window";
import prisma from "@/lib/prisma";
import { emailGreetingName } from "@/lib/email/template-format";
import { buildHrNotificationEmailTemplate } from "@/lib/email/template-hr-notification";

const DEFAULT_LOW_ACTIVITY_DAYS = 7;
const DEFAULT_ACCESS_EXPIRING_DAYS = 7;
const COMPLETION_LOOKBACK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type HrNotificationType = "course_completed" | "low_activity" | "access_expiring";

export type HrNotificationPreferenceView = {
  notifyCourseCompleted: boolean;
  notifyLowActivity: boolean;
  lowActivityDays: number;
  notifyAccessExpiring: boolean;
  accessExpiringDays: number;
};

export type HrNotificationItem = {
  key: string;
  notificationKey: string;
  type: HrNotificationType;
  title: string;
  description: string;
  occurredAt: Date;
  learnerId: string;
  learnerName: string;
  learnerLogin: string;
  courseTitle: string;
  courseId: string;
  href: string;
  isDismissed: boolean;
  dismissedAt: Date | null;
};

export type HrNotificationFeed = {
  preferences: HrNotificationPreferenceView;
  items: HrNotificationItem[];
  summary: {
    total: number;
    completed: number;
    lowActivity: number;
    accessExpiring: number;
    processed: number;
  };
};

export type HrNotificationMailtoDraft = {
  href: string;
  toEmail: string;
  subject: string;
  body: string;
  itemTitle: string;
  itemCount: number;
};

type HrNotificationDraftItem = Omit<HrNotificationItem, "notificationKey" | "isDismissed" | "dismissedAt">;

export type HrNotificationFeedOptions = {
  includeDismissed?: boolean;
};

export async function getHrNotificationFeed(
  userId: string,
  options: HrNotificationFeedOptions = {}
): Promise<HrNotificationFeed> {
  const preferencesRecord = await prisma.hrNotificationPreference.findUnique({
    where: { userId },
    select: {
      notifyCourseCompleted: true,
      notifyLowActivity: true,
      lowActivityDays: true,
      notifyAccessExpiring: true,
      accessExpiringDays: true,
    },
  });

  const preferences: HrNotificationPreferenceView = {
    notifyCourseCompleted: preferencesRecord?.notifyCourseCompleted ?? true,
    notifyLowActivity: preferencesRecord?.notifyLowActivity ?? true,
    lowActivityDays: clampLowActivityDays(preferencesRecord?.lowActivityDays ?? DEFAULT_LOW_ACTIVITY_DAYS),
    notifyAccessExpiring: preferencesRecord?.notifyAccessExpiring ?? true,
    accessExpiringDays: clampAccessExpiringDays(
      preferencesRecord?.accessExpiringDays ?? DEFAULT_ACCESS_EXPIRING_DAYS
    ),
  };

  const feed = await buildHrNotificationFeed(preferences);
  if (feed.items.length === 0) return feed;

  const notificationKeys = feed.items.map((item) => item.notificationKey);
  const dismissals = await prisma.hrNotificationDismissal.findMany({
    where: {
      userId,
      notificationKey: { in: notificationKeys },
    },
    select: {
      notificationKey: true,
      dismissedAt: true,
    },
  });

  const dismissedAtByKey = new Map(dismissals.map((dismissal) => [dismissal.notificationKey, dismissal.dismissedAt]));
  const items = feed.items.map((item) => {
    const dismissedAt = dismissedAtByKey.get(item.notificationKey) ?? null;
    return {
      ...item,
      isDismissed: Boolean(dismissedAt),
      dismissedAt,
    };
  });

  const visibleItems = options.includeDismissed ? items : items.filter((item) => !item.isDismissed);

  return {
    preferences,
    items: visibleItems,
    summary: getHrNotificationSummary(visibleItems),
  };
}

export async function queueHrNotificationEmailsForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      firstName: true,
    },
  });

  if (!user || !user.email || user.status !== "ACTIVE") {
    return { queuedCount: 0, reason: "no_email" as const };
  }

  const feed = await getHrNotificationFeed(userId);
  if (feed.items.length === 0) {
    return { queuedCount: 0, reason: "empty" as const };
  }

  const notificationKeys = feed.items.map(getHrNotificationDispatchKey);
  const alreadyQueued = await prisma.hrNotificationDispatch.findMany({
    where: {
      userId,
      notificationKey: { in: notificationKeys },
    },
    select: { notificationKey: true },
  });
  const existingKeys = new Set(alreadyQueued.map((item) => item.notificationKey));
  const pendingItems = feed.items.filter((item) => !existingKeys.has(getHrNotificationDispatchKey(item)));

  if (pendingItems.length === 0) {
    return { queuedCount: 0, reason: "already_sent" as const };
  }

  const baseUrl = appBaseUrl();
  const emailJobs = pendingItems.map((item) => {
    const courseUrl = toAbsoluteUrl(baseUrl, item.href);
    const template = buildHrNotificationEmailTemplate({
      recipientName: user.firstName || emailGreetingName(user.name),
      notificationType: item.type,
      learnerName: item.learnerName,
      learnerLogin: item.learnerLogin,
      courseTitle: item.courseTitle,
      courseUrl,
      lowActivityDays: item.type === "low_activity" ? feed.preferences.lowActivityDays : null,
      accessExpiresAtLabel:
        item.type === "access_expiring" ? formatDateRu(item.occurredAt) : null,
      accessExpiringDays:
        item.type === "access_expiring" ? feed.preferences.accessExpiringDays : null,
    });

    return {
      toEmail: user.email!,
      toName: user.name,
      subject: template.subject,
      htmlBody: template.html,
      textBody: template.text,
      template: "HR_NOTIFICATION",
      payloadJson: JSON.stringify({
        type: item.type,
        learnerId: item.learnerId,
        learnerLogin: item.learnerLogin,
        courseId: item.courseId,
        courseTitle: item.courseTitle,
        href: item.href,
        occurredAt: item.occurredAt.toISOString(),
      }),
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    };
  });

  const dispatchRows = pendingItems.map((item) => ({
    userId,
    notificationKey: getHrNotificationDispatchKey(item),
    type: item.type,
    courseId: item.courseId,
    learnerId: item.learnerId,
    occurredAt: item.occurredAt,
  }));

  await prisma.$transaction([
    prisma.emailJob.createMany({ data: emailJobs }),
    prisma.hrNotificationDispatch.createMany({ data: dispatchRows }),
  ]);

  return { queuedCount: pendingItems.length, reason: "queued" as const };
}

export async function queueHrNotificationEmailsForSubscribedUsers() {
  const recipients = await prisma.hrNotificationPreference.findMany({
    where: {
      OR: [
        { notifyCourseCompleted: true },
        { notifyLowActivity: true },
        { notifyAccessExpiring: true },
      ],
      user: {
        email: { not: null },
        status: "ACTIVE",
      },
    },
    select: { userId: true },
  });

  let queuedCount = 0;
  let recipientCount = 0;

  for (const recipient of recipients) {
    const result = await queueHrNotificationEmailsForUser(recipient.userId);
    if (result.queuedCount > 0) {
      recipientCount += 1;
      queuedCount += result.queuedCount;
    }
  }

  return { queuedCount, recipientCount };
}

export function getHrNotificationDispatchKey(
  item: Pick<HrNotificationItem, "key" | "type" | "occurredAt"> & { notificationKey?: string }
) {
  if (item.notificationKey) return item.notificationKey;
  if (item.type === "course_completed") return item.key;
  return `${item.key}:${item.occurredAt.toISOString()}`;
}

export function buildHrNotificationMailtoDraft(input: {
  item: HrNotificationItem;
  preferences: HrNotificationPreferenceView;
  recipientName?: string | null;
  recipientEmail?: string | null;
  itemCount: number;
}) {
  const courseUrl = toAbsoluteUrl(appBaseUrl(), input.item.href);
  const template = buildHrNotificationEmailTemplate({
    recipientName: input.recipientName,
    notificationType: input.item.type,
    learnerName: input.item.learnerName,
    learnerLogin: input.item.learnerLogin,
    courseTitle: input.item.courseTitle,
    courseUrl,
    lowActivityDays: input.item.type === "low_activity" ? input.preferences.lowActivityDays : null,
    accessExpiresAtLabel: input.item.type === "access_expiring" ? formatDateRu(input.item.occurredAt) : null,
    accessExpiringDays: input.item.type === "access_expiring" ? input.preferences.accessExpiringDays : null,
  });

  const toEmail = input.recipientEmail?.trim() ?? "";
  const params = new URLSearchParams({
    subject: template.subject,
    body: template.text,
  });

  return {
    href: `mailto:${encodeURIComponent(toEmail)}?${params.toString()}`,
    toEmail,
    subject: template.subject,
    body: template.text,
    itemTitle: input.item.title,
    itemCount: input.itemCount,
  } satisfies HrNotificationMailtoDraft;
}

async function buildHrNotificationFeed(preferences: HrNotificationPreferenceView): Promise<HrNotificationFeed> {
  if (
    !preferences.notifyCourseCompleted &&
    !preferences.notifyLowActivity &&
    !preferences.notifyAccessExpiring
  ) {
    return {
      preferences,
      items: [],
      summary: { total: 0, completed: 0, lowActivity: 0, accessExpiring: 0, processed: 0 },
    };
  }

  const now = new Date();
  const completionSince = new Date(now.getTime() - COMPLETION_LOOKBACK_DAYS * DAY_MS);
  const lowActivityThreshold = new Date(now.getTime() - preferences.lowActivityDays * DAY_MS);
  const accessExpiringThreshold = new Date(now.getTime() + preferences.accessExpiringDays * DAY_MS);

  const assignments = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ directAssignments: { some: {} } }, { groupAssignments: { some: {} } }],
    },
    select: {
      id: true,
      title: true,
      description: true,
      quizGateMode: true,
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
              status: true,
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
              memberships: {
                select: {
                  userId: true,
                  user: {
                    select: {
                      id: true,
                      name: true,
                      login: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      items: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          type: true,
          isRequired: true,
          views: {
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
                select: {
                  userId: true,
                  outcome: true,
                  correctAnswers: true,
                  attemptNumber: true,
                  score: true,
                  completedAt: true,
                },
                orderBy: { attemptNumber: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const items: HrNotificationDraftItem[] = [];

  for (const course of assignments) {
    const learnerAssignments = new Map<
      string,
      {
        learner: { id: string; name: string; login: string; status: string };
        assignedAtCandidates: Date[];
        directAccessExpiresAt: Array<Date | null>;
        groupAccessExpiresAt: Array<Date | null>;
      }
    >();

    for (const assignment of course.directAssignments) {
      learnerAssignments.set(assignment.userId, {
        learner: assignment.user,
        assignedAtCandidates: [
          ...(learnerAssignments.get(assignment.userId)?.assignedAtCandidates ?? []),
          assignment.assignedAt,
        ],
        directAccessExpiresAt: [
          ...(learnerAssignments.get(assignment.userId)?.directAccessExpiresAt ?? []),
          assignment.expiresAt,
        ],
        groupAccessExpiresAt: learnerAssignments.get(assignment.userId)?.groupAccessExpiresAt ?? [],
      });
    }

    for (const assignment of course.groupAssignments) {
      for (const membership of assignment.group.memberships) {
        learnerAssignments.set(membership.userId, {
          learner: membership.user,
          assignedAtCandidates: [
            ...(learnerAssignments.get(membership.userId)?.assignedAtCandidates ?? []),
            assignment.assignedAt,
          ],
          directAccessExpiresAt: learnerAssignments.get(membership.userId)?.directAccessExpiresAt ?? [],
          groupAccessExpiresAt: [
            ...(learnerAssignments.get(membership.userId)?.groupAccessExpiresAt ?? []),
            assignment.expiresAt,
          ],
        });
      }
    }

    const materialProgressByUserAndItem = new Map<string, { percent: number; viewedAt: Date }>();
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

    for (const item of course.items) {
      for (const view of item.views) {
        materialProgressByUserAndItem.set(`${view.userId}:${item.id}`, {
          percent: view.progressPercent,
          viewedAt: view.viewedAt,
        });
      }

      if (!item.quiz) continue;
      for (const attempt of item.quiz.attempts) {
        const key = `${attempt.userId}:${item.quiz.id}`;
        const attempts = quizAttemptsByUserAndQuiz.get(key) ?? [];
        attempts.push(attempt);
        quizAttemptsByUserAndQuiz.set(key, attempts);
      }
    }

    for (const [learnerId, seed] of learnerAssignments) {
      if (seed.learner.status !== "ACTIVE") continue;

      const assignedAt = seed.assignedAtCandidates.reduce<Date | null>(
        (earliest, value) => (!earliest || value.getTime() < earliest.getTime() ? value : earliest),
        null
      );
      if (!assignedAt) continue;
      const accessWindow = resolveEffectiveCourseAccessWindow(
        seed.directAccessExpiresAt,
        seed.groupAccessExpiresAt,
        now
      );
      if (!accessWindow) continue;

      const progress = getCourseProgress({
        courseTitle: course.title,
        courseDescription: course.description,
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
        items: course.items.map((item) => {
          const material = materialProgressByUserAndItem.get(`${learnerId}:${item.id}`);
          return {
            id: item.id,
            type: item.type,
            isRequired: item.isRequired,
            viewed: item.type === "QUIZ" ? false : (material?.percent ?? 0) > 0,
            materialProgress: material?.percent ?? 0,
            quiz: item.quiz
              ? {
                  maxAttempts: item.quiz.maxAttempts,
                  minCorrectAnswers: item.quiz.minCorrectAnswers,
                  attempts: quizAttemptsByUserAndQuiz.get(`${learnerId}:${item.quiz.id}`) ?? [],
                }
              : null,
          };
        }),
      });

      const lastMaterialActivity = course.items.reduce<Date | null>((latest, item) => {
        const viewedAt = materialProgressByUserAndItem.get(`${learnerId}:${item.id}`)?.viewedAt;
        if (!viewedAt) return latest;
        return !latest || viewedAt.getTime() > latest.getTime() ? viewedAt : latest;
      }, null);
      const lastQuizActivity = course.items.reduce<Date | null>((latest, item) => {
        if (!item.quiz) return latest;
        const attempts = quizAttemptsByUserAndQuiz.get(`${learnerId}:${item.quiz.id}`) ?? [];
        const attemptDate = attempts.reduce<Date | null>(
          (innerLatest, attempt) =>
            !innerLatest || attempt.completedAt.getTime() > innerLatest.getTime() ? attempt.completedAt : innerLatest,
          null
        );
        if (!attemptDate) return latest;
        return !latest || attemptDate.getTime() > latest.getTime() ? attemptDate : latest;
      }, null);
      const lastActivityAt = [lastMaterialActivity, lastQuizActivity].reduce<Date | null>((latest, date) => {
        if (!date) return latest;
        return !latest || date.getTime() > latest.getTime() ? date : latest;
      }, null);

      if (preferences.notifyCourseCompleted && progress.isCompleted) {
        const completedAt = lastActivityAt ?? assignedAt;
        if (completedAt >= completionSince) {
          items.push({
            key: `completed:${course.id}:${learnerId}`,
            type: "course_completed",
            title: `${seed.learner.name} завершил курс`,
            description: `Курс «${course.title}» завершен. Можно проверить прогресс и результаты ученика.`,
            occurredAt: completedAt,
            learnerId,
            learnerName: seed.learner.name,
            learnerLogin: seed.learner.login,
            courseTitle: course.title,
            courseId: course.id,
            href: `/courses/${course.id}/learners?q=${encodeURIComponent(seed.learner.login)}`,
          });
        }
      }

      if (preferences.notifyLowActivity && accessWindow.isActive && !progress.isCompleted) {
        const inactivityReference = lastActivityAt ?? assignedAt;
        if (inactivityReference <= lowActivityThreshold) {
          items.push({
            key: `inactive:${course.id}:${learnerId}`,
            type: "low_activity",
            title: `${seed.learner.name} давно не заходил в курс`,
            description: `По курсу «${course.title}» нет активности уже ${preferences.lowActivityDays} дн. Проверьте ученика и прогресс.`,
            occurredAt: inactivityReference,
            learnerId,
            learnerName: seed.learner.name,
            learnerLogin: seed.learner.login,
            courseTitle: course.title,
            courseId: course.id,
            href: `/courses/${course.id}/learners?q=${encodeURIComponent(seed.learner.login)}`,
          });
        }
      }

      if (
        preferences.notifyAccessExpiring &&
        accessWindow.isActive &&
        !accessWindow.isUnlimited &&
        !progress.isCompleted &&
        accessWindow.expiresAt &&
        accessWindow.expiresAt <= accessExpiringThreshold
      ) {
        const daysUntilExpiry = Math.max(
          Math.ceil((accessWindow.expiresAt.getTime() - now.getTime()) / DAY_MS),
          1
        );

        items.push({
          key: `expiring:${course.id}:${learnerId}`,
          type: "access_expiring",
          title: `${seed.learner.name}: скоро истекает доступ`,
          description: `По курсу «${course.title}» доступ истекает ${formatDateRu(accessWindow.expiresAt)}. Осталось ${daysUntilExpiry} дн. Продлите доступ, если обучение нужно продолжить.`,
          occurredAt: accessWindow.expiresAt,
          learnerId,
          learnerName: seed.learner.name,
          learnerLogin: seed.learner.login,
          courseTitle: course.title,
          courseId: course.id,
          href: `/courses/${course.id}/learners?q=${encodeURIComponent(seed.learner.login)}`,
        });
      }
    }
  }

  const dedupedItems = Array.from(new Map(items.map((item) => [item.key, item])).values())
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .map((item) => ({
      ...item,
      notificationKey: getHrNotificationDispatchKey(item),
      isDismissed: false,
      dismissedAt: null,
    }));

  return {
    preferences,
    items: dedupedItems,
    summary: getHrNotificationSummary(dedupedItems),
  };
}

function getHrNotificationSummary(items: HrNotificationItem[]) {
  return {
    total: items.length,
    completed: items.filter((item) => item.type === "course_completed").length,
    lowActivity: items.filter((item) => item.type === "low_activity").length,
    accessExpiring: items.filter((item) => item.type === "access_expiring").length,
    processed: items.filter((item) => item.isDismissed).length,
  };
}

function clampLowActivityDays(value: number) {
  const normalized = Math.floor(Number(value) || DEFAULT_LOW_ACTIVITY_DAYS);
  return Math.min(Math.max(normalized, 1), 180);
}

function clampAccessExpiringDays(value: number) {
  const normalized = Math.floor(Number(value) || DEFAULT_ACCESS_EXPIRING_DAYS);
  return Math.min(Math.max(normalized, 1), 180);
}

function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function toAbsoluteUrl(baseUrl: string, href: string) {
  return new URL(href, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}
