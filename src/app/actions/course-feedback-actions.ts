"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageCourse, requireSession } from "@/lib/auth-guards";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
} from "@/lib/audit-log";
import { isUserAssignedToCourse } from "@/lib/access";
import { getPlatformSettings } from "@/lib/platform-settings";
import { canTrackMaterialProgress } from "@/lib/roles";
import { CourseFeedbackApplicationError } from "@/modules/course/application/course-feedback-errors";
import { courseFeedback } from "@/modules/course/server/course-feedback";
import { asOptionalString, asString } from "./course-action-input";

async function actorContext(
  sessionUser: Parameters<typeof auditActorFromSessionUser>[0],
) {
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(sessionUser);
  return {
    actor: { id: actor.id, login: actor.login, name: actor.name },
    audit: {
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    },
  };
}

export async function submitFeedback(courseId: string, formData: FormData) {
  const session = await requireSession();
  const settings = await getPlatformSettings();
  const allowed =
    canTrackMaterialProgress(session.user.roles, session.user.permissions) &&
    (await isUserAssignedToCourse(session.user.id, courseId));
  if (!allowed) redirect("/");
  if (!settings.feedbackEnabled) redirect(`/courses/${courseId}`);

  let result;
  try {
    result = await courseFeedback.submit({
      courseId,
      userId: session.user.id,
      rating: Number.parseInt(asString(formData, "rating"), 10),
      comment: asOptionalString(formData, "comment"),
      moderationEnabled: settings.feedbackModerationEnabled,
    });
  } catch (error) {
    if (error instanceof CourseFeedbackApplicationError) {
      if (error.code === "COURSE_NOT_FOUND") redirect("/");
      if (error.code === "NOT_COMPLETE") {
        redirect(`/courses/${courseId}/feedback?feedback=locked`);
      }
      // VALIDATION_FAILED (некорректная оценка) — как и раньше, бросаем.
      throw new Error(error.message);
    }
    throw error;
  }

  revalidateFeedback(courseId);
  redirect(
    result.status === "PENDING"
      ? `/courses/${courseId}/feedback?feedback=pending`
      : `/courses/${courseId}/feedback`,
  );
}

export async function deleteMyCourseFeedback(courseId: string) {
  const session = await requireSession();
  const { actor, audit } = await actorContext(session.user);
  try {
    await courseFeedback.deleteMine({
      courseId,
      userId: session.user.id,
      actor,
      audit,
    });
  } catch (error) {
    if (
      error instanceof CourseFeedbackApplicationError &&
      error.code === "FEEDBACK_NOT_FOUND"
    ) {
      redirect(`/courses/${courseId}/feedback`);
    }
    throw error;
  }
  revalidateFeedback(courseId);
  redirect(`/courses/${courseId}/feedback?feedback=deleted`);
}

export async function publishCourseFeedback(courseId: string, feedbackId: string) {
  const session = await requireManageCourse(courseId);
  const { actor, audit } = await actorContext(session.user);
  try {
    await courseFeedback.publish({ courseId, feedbackId, actor, audit });
  } catch (error) {
    if (error instanceof CourseFeedbackApplicationError) {
      if (error.code === "FEEDBACK_NOT_FOUND") {
        redirect(manageCourseUrl(courseId, { section: "feedback", feedbackError: error.message }));
      }
      if (error.code === "ALREADY_PUBLISHED") {
        redirect(manageCourseUrl(courseId, { section: "feedback", feedbackSaved: error.message }));
      }
    }
    throw error;
  }
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
