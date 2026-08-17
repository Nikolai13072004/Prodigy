import prisma from "@/lib/prisma";
import {
  enqueueCourseReminderEmails,
} from "@/lib/email/queue";
import { getPlatformSettings } from "@/lib/platform-settings";
import type { CourseReminderType } from "@/lib/email/template-course-reminder";

const DEFAULT_EXPIRING_DAYS = 3;
const DEFAULT_POLL_MS = 6 * 60 * 60 * 1000;

type ReminderCandidate = {
  type: CourseReminderType;
  courseId: string;
  courseTitle: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  deadline: Date | null;
};

function asInt(input: string | undefined, fallback: number) {
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3002"
  );
}

function toAbsoluteUrl(href: string) {
  return new URL(href, appBaseUrl().endsWith("/") ? appBaseUrl() : `${appBaseUrl()}/`).toString();
}

function periodKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatDeadline(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function hasAnyActivity(courseId: string, userId: string) {
  const [views, attempts] = await Promise.all([
    prisma.courseItemView.count({
      where: {
        userId,
        courseItem: { courseId },
      },
    }),
    prisma.quizAttempt.count({
      where: {
        userId,
        quiz: {
          courseItem: { courseId },
        },
      },
    }),
  ]);

  return views + attempts > 0;
}

async function hasFailedQuiz(courseId: string, userId: string) {
  const result = await prisma.quizUserBestResult.findFirst({
    where: {
      userId,
      status: "FAILED",
      quiz: {
        courseItem: { courseId },
      },
    },
    select: { id: true },
  });

  return Boolean(result);
}

async function collectEffectiveAssignments() {
  const [directAssignments, groupAssignments] = await Promise.all([
    prisma.courseUserAssignment.findMany({
      where: {
        course: { status: "PUBLISHED" },
        user: {
          status: "ACTIVE",
          email: { not: null },
        },
      },
      include: {
        course: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.courseGroupAssignment.findMany({
      where: {
        course: { status: "PUBLISHED" },
      },
      include: {
        course: { select: { id: true, title: true } },
        group: {
          include: {
            memberships: {
              where: {
                user: {
                  status: "ACTIVE",
                  email: { not: null },
                },
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const assignments = new Map<string, ReminderCandidate & { expiresAt: Date | null }>();

  for (const assignment of directAssignments) {
    if (!assignment.user.email) continue;
    assignments.set(`${assignment.courseId}:${assignment.userId}`, {
      type: "NOT_STARTED",
      courseId: assignment.courseId,
      courseTitle: assignment.course.title,
      userId: assignment.userId,
      userName: assignment.user.name,
      userEmail: assignment.user.email,
      deadline: assignment.expiresAt,
      expiresAt: assignment.expiresAt,
    });
  }

  for (const assignment of groupAssignments) {
    for (const membership of assignment.group.memberships) {
      const user = membership.user;
      if (!user.email) continue;
      const key = `${assignment.courseId}:${user.id}`;
      const existing = assignments.get(key);
      const expiresAt = chooseNearestDeadline(existing?.expiresAt ?? null, assignment.expiresAt);
      assignments.set(key, {
        type: "NOT_STARTED",
        courseId: assignment.courseId,
        courseTitle: assignment.course.title,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        deadline: expiresAt,
        expiresAt,
      });
    }
  }

  return Array.from(assignments.values());
}

function chooseNearestDeadline(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

async function createDispatch(candidate: ReminderCandidate) {
  try {
    await prisma.courseReminderDispatch.create({
      data: {
        type: candidate.type,
        courseId: candidate.courseId,
        userId: candidate.userId,
        periodKey: periodKey(),
      },
    });
    return true;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002") return false;
    throw error;
  }
}

async function queueCandidate(candidate: ReminderCandidate) {
  const created = await createDispatch(candidate);
  if (!created) return 0;

  await enqueueCourseReminderEmails(
    [{ email: candidate.userEmail, name: candidate.userName }],
    {
      type: candidate.type,
      courseId: candidate.courseId,
      courseTitle: candidate.courseTitle,
      courseUrl: toAbsoluteUrl(`/courses/${candidate.courseId}`),
      deadlineLabel: formatDeadline(candidate.deadline),
    }
  );

  return 1;
}

async function runOnce() {
  const now = new Date();
  const settings = await getPlatformSettings();
  if (!settings.courseRemindersEnabled) {
    console.info("[course-reminders] disabled by platform settings");
    return;
  }

  const expiringDays = process.env.COURSE_REMINDER_EXPIRING_DAYS
    ? asInt(process.env.COURSE_REMINDER_EXPIRING_DAYS, DEFAULT_EXPIRING_DAYS)
    : settings.courseReminderExpiringDays;
  const expiringUntil = new Date(now.getTime() + expiringDays * 24 * 60 * 60 * 1000);
  const assignments = await collectEffectiveAssignments();
  let queuedCount = 0;

  for (const assignment of assignments) {
    const hasActivity = await hasAnyActivity(assignment.courseId, assignment.userId);
    if (settings.courseReminderNotStartedEnabled && !hasActivity) {
      queuedCount += await queueCandidate({ ...assignment, type: "NOT_STARTED" });
    }

    if (
      settings.courseReminderExpiringEnabled &&
      assignment.expiresAt &&
      assignment.expiresAt > now &&
      assignment.expiresAt <= expiringUntil
    ) {
      queuedCount += await queueCandidate({ ...assignment, type: "EXPIRING", deadline: assignment.expiresAt });
    }

    if (settings.courseReminderExpiredEnabled && assignment.expiresAt && assignment.expiresAt <= now) {
      queuedCount += await queueCandidate({ ...assignment, type: "EXPIRED", deadline: assignment.expiresAt });
    }

    if (settings.courseReminderQuizFailedEnabled && (await hasFailedQuiz(assignment.courseId, assignment.userId))) {
      queuedCount += await queueCandidate({ ...assignment, type: "QUIZ_FAILED" });
    }
  }

  console.info(`[course-reminders] candidates=${assignments.length} queued=${queuedCount}`);
}

async function runLoop() {
  const pollMs = asInt(process.env.COURSE_REMINDER_POLL_MS, DEFAULT_POLL_MS);
  console.info(`[course-reminders] loop started: poll=${pollMs}ms`);

  while (true) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function main() {
  const mode = (process.argv[2] ?? "once").toLowerCase();
  if (mode === "loop") {
    await runLoop();
    return;
  }
  await runOnce();
}

main()
  .catch((error) => {
    console.error("[course-reminders] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
