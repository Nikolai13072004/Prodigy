import prisma from "@/lib/prisma";

export type PlatformAttentionCard = {
  key: string;
  label: string;
  value: number;
  href: string;
  tone: "amber" | "rose" | "sky" | "emerald";
};

export type PlatformAttentionItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  createdAt: Date;
  kind: "review" | "feedback" | "email" | "deadline";
};

export async function getPlatformAttentionOverview() {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    pendingReviewCount,
    pendingFeedbackCount,
    failedEmailCount,
    expiringDirectCount,
    expiringGroupCount,
    expiringInviteCount,
    pendingReviews,
    pendingFeedbacks,
    failedEmails,
    expiringDirectAssignments,
    expiringGroupAssignments,
    expiringInvites,
  ] = await Promise.all([
    prisma.quizAttempt.count({ where: { outcome: "PENDING_REVIEW" } }),
    prisma.courseFeedback.count({ where: { status: "PENDING" } }),
    prisma.emailJob.count({ where: { status: "FAILED" } }),
    prisma.courseUserAssignment.count({
      where: { expiresAt: { gt: now, lte: soon }, course: { status: "PUBLISHED" } },
    }),
    prisma.courseGroupAssignment.count({
      where: { expiresAt: { gt: now, lte: soon }, course: { status: "PUBLISHED" } },
    }),
    prisma.courseInvite.count({
      where: { status: "PENDING", accessExpiresAt: { gt: now, lte: soon }, course: { status: "PUBLISHED" } },
    }),
    prisma.quizAttempt.findMany({
      where: { outcome: "PENDING_REVIEW" },
      orderBy: { completedAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true, login: true } },
        quiz: {
          select: {
            id: true,
            courseItem: {
              select: {
                title: true,
                courseId: true,
                course: { select: { title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.courseFeedback.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true, login: true } },
        course: { select: { id: true, title: true } },
      },
    }),
    prisma.emailJob.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        toEmail: true,
        subject: true,
        lastError: true,
        updatedAt: true,
      },
    }),
    prisma.courseUserAssignment.findMany({
      where: { expiresAt: { gt: now, lte: soon }, course: { status: "PUBLISHED" } },
      orderBy: { expiresAt: "asc" },
      take: 6,
      include: {
        user: { select: { name: true, login: true } },
        course: { select: { id: true, title: true } },
      },
    }),
    prisma.courseGroupAssignment.findMany({
      where: { expiresAt: { gt: now, lte: soon }, course: { status: "PUBLISHED" } },
      orderBy: { expiresAt: "asc" },
      take: 6,
      include: {
        group: { select: { name: true } },
        course: { select: { id: true, title: true } },
      },
    }),
    prisma.courseInvite.findMany({
      where: { status: "PENDING", accessExpiresAt: { gt: now, lte: soon }, course: { status: "PUBLISHED" } },
      orderBy: { accessExpiresAt: "asc" },
      take: 6,
      include: {
        course: { select: { id: true, title: true } },
      },
    }),
  ]);

  const expiringAssignmentCount = expiringDirectCount + expiringGroupCount + expiringInviteCount;
  const cards: PlatformAttentionCard[] = [
    {
      key: "reviews",
      label: "На проверке",
      value: pendingReviewCount,
      href: "/admin/reports/problems#manual-reviews",
      tone: "amber",
    },
    {
      key: "feedback",
      label: "Отзывы на модерации",
      value: pendingFeedbackCount,
      href: "/admin/reports/feedback",
      tone: "sky",
    },
    {
      key: "email",
      label: "Ошибки email",
      value: failedEmailCount,
      href: "/admin/reports/email-queue",
      tone: "rose",
    },
    {
      key: "deadlines",
      label: "Доступ истекает за 7 дней",
      value: expiringAssignmentCount,
      href: "/admin/reports/problems#deadlines",
      tone: "emerald",
    },
  ];

  const items: PlatformAttentionItem[] = [
    ...pendingReviews.map((attempt) => ({
      id: attempt.id,
      kind: "review" as const,
      title: `Проверить: ${attempt.quiz.courseItem.title}`,
      meta: `${attempt.user.name} (${attempt.user.login}) · ${attempt.quiz.courseItem.course.title}`,
      href: `/courses/${attempt.quiz.courseItem.courseId}/manage?section=reviews&attempt=${attempt.id}`,
      createdAt: attempt.completedAt,
    })),
    ...pendingFeedbacks.map((feedback) => ({
      id: feedback.id,
      kind: "feedback" as const,
      title: `Отзыв по курсу «${feedback.course.title}»`,
      meta: `${feedback.user.name} (${feedback.user.login}) · оценка ${feedback.rating}/5`,
      href: `/courses/${feedback.course.id}/manage?section=feedback`,
      createdAt: feedback.createdAt,
    })),
    ...failedEmails.map((email) => ({
      id: email.id,
      kind: "email" as const,
      title: email.subject,
      meta: `${email.toEmail}${email.lastError ? ` · ${email.lastError}` : ""}`,
      href: "/admin/reports/email-queue",
      createdAt: email.updatedAt,
    })),
    ...expiringDirectAssignments.map((assignment) => ({
      id: assignment.id,
      kind: "deadline" as const,
      title: `Истекает доступ: ${assignment.course.title}`,
      meta: `${assignment.user.name} (${assignment.user.login}) · до ${assignment.expiresAt?.toLocaleString("ru-RU")}`,
      href: `/courses/${assignment.course.id}/manage?section=assignments`,
      createdAt: assignment.expiresAt ?? now,
    })),
    ...expiringGroupAssignments.map((assignment) => ({
      id: assignment.id,
      kind: "deadline" as const,
      title: `Истекает групповой доступ: ${assignment.course.title}`,
      meta: `${assignment.group.name} · до ${assignment.expiresAt?.toLocaleString("ru-RU")}`,
      href: `/courses/${assignment.course.id}/manage?section=assignments`,
      createdAt: assignment.expiresAt ?? now,
    })),
    ...expiringInvites.map((invite) => ({
      id: invite.id,
      kind: "deadline" as const,
      title: `Истекает приглашение: ${invite.course.title}`,
      meta: `${invite.email} · до ${invite.accessExpiresAt?.toLocaleString("ru-RU")}`,
      href: `/courses/${invite.course.id}/manage?section=assignments`,
      createdAt: invite.accessExpiresAt ?? now,
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return {
    cards,
    items: items.slice(0, 20),
  };
}
