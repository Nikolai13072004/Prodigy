"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireManageCourse, requireSession } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { isUserAssignedToCourse } from "@/lib/access";
import { getCourseProgress } from "@/lib/course-progress";
import { isValidFeedbackRating, resolveFeedbackStatus } from "@/modules/course/domain/feedback-submission";
import { getPlatformSettings } from "@/lib/platform-settings";
import { canTrackMaterialProgress } from "@/lib/roles";
import { asOptionalString, asString } from "./course-action-input";

export async function submitFeedback(courseId: string, formData: FormData) {
  const session = await requireSession();
  const settings = await getPlatformSettings();
  const allowed = canTrackMaterialProgress(session.user.roles, session.user.permissions)
    && await isUserAssignedToCourse(session.user.id, courseId);
  if (!allowed) redirect("/");
  if (!settings.feedbackEnabled) redirect(`/courses/${courseId}`);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      quizGateMode: true,
      items: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          type: true,
          title: true,
          isRequired: true,
          views: {
            where: { userId: session.user.id },
            select: { progressPercent: true },
            take: 1,
          },
          quiz: {
            select: {
              maxAttempts: true,
              minCorrectAnswers: true,
              timeLimitMinutes: true,
              shuffleQuestions: true,
              shuffleAnswers: true,
              lockMaterialsOnStart: true,
              attempts: {
                where: { userId: session.user.id },
                select: {
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
  });
  if (!course) redirect("/");

  const progress = getCourseProgress({
    quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
    items: course.items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      isRequired: item.isRequired,
      viewed: item.type === "QUIZ" ? false : item.views.length > 0,
      materialProgress: item.type === "QUIZ" ? 0 : item.views[0]?.progressPercent ?? 0,
      quiz: item.quiz,
    })),
  });
  if (progress.percent < 100) redirect(`/courses/${courseId}/feedback?feedback=locked`);

  const rating = Number.parseInt(asString(formData, "rating"), 10);
  if (!isValidFeedbackRating(rating)) {
    throw new Error("Оценка должна быть от 1 до 5");
  }
  const status = resolveFeedbackStatus(settings.feedbackModerationEnabled);
  await prisma.courseFeedback.upsert({
    where: { courseId_userId: { courseId, userId: session.user.id } },
    create: { courseId, userId: session.user.id, rating, status, comment: asOptionalString(formData, "comment") },
    update: { rating, status, comment: asOptionalString(formData, "comment") },
  });
  revalidateFeedback(courseId);
  redirect(status === "PENDING"
    ? `/courses/${courseId}/feedback?feedback=pending`
    : `/courses/${courseId}/feedback`);
}

export async function deleteMyCourseFeedback(courseId: string) {
  const session = await requireSession();
  const feedback = await prisma.courseFeedback.findUnique({
    where: { courseId_userId: { courseId, userId: session.user.id } },
    select: { id: true, rating: true, comment: true, course: { select: { title: true } } },
  });
  if (!feedback) redirect(`/courses/${courseId}/feedback`);
  await prisma.courseFeedback.delete({ where: { id: feedback.id } });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "course_feedback:delete",
    objectType: "course_feedback",
    objectId: feedback.id,
    objectLabel: feedback.course.title,
    metadata: { courseId, rating: feedback.rating, comment: feedback.comment },
  });
  revalidateFeedback(courseId);
  redirect(`/courses/${courseId}/feedback?feedback=deleted`);
}

export async function publishCourseFeedback(courseId: string, feedbackId: string) {
  const session = await requireManageCourse(courseId);
  const feedback = await prisma.courseFeedback.findFirst({
    where: { id: feedbackId, courseId },
    select: {
      id: true,
      status: true,
      userId: true,
      course: { select: { id: true, title: true } },
      user: { select: { name: true, login: true } },
    },
  });
  if (!feedback) {
    redirect(manageCourseUrl(courseId, { section: "feedback", feedbackError: "Отзыв не найден." }));
  }
  if (feedback.status === "PUBLISHED") {
    redirect(manageCourseUrl(courseId, { section: "feedback", feedbackSaved: "Отзыв уже опубликован." }));
  }
  await prisma.courseFeedback.update({ where: { id: feedback.id }, data: { status: "PUBLISHED" } });
  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "course_feedback:publish",
    objectType: "course_feedback",
    objectId: feedback.id,
    objectLabel: feedback.course.title,
    metadata: {
      courseId: feedback.course.id,
      learnerId: feedback.userId,
      learnerLogin: feedback.user.login,
      learnerName: feedback.user.name,
    },
  });
  revalidateFeedback(courseId);
  redirect(manageCourseUrl(courseId, { section: "feedback", feedbackSaved: "Отзыв опубликован." }));
}

function revalidateFeedback(courseId: string) {
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/history");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/about`);
  revalidatePath(`/courses/${courseId}/feedback`);
  revalidatePath(`/courses/${courseId}/manage`);
}

function manageCourseUrl(courseId: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  return `/courses/${courseId}/manage?${search.toString()}`;
}
