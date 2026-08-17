"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageCourse, requirePublishCourse } from "@/lib/auth-guards";
import { auditActorFromSessionUser, getAuditRequestContext } from "@/lib/audit-log";
import { CourseApplicationError } from "@/modules/course/application/errors";
import { manageCourseLifecycle } from "@/modules/course/server/manage-course-lifecycle";
import { manageCourseSettings } from "@/modules/course/server/manage-course-settings";
import {
  asOptionalString,
  asString,
  parseCourseMetadata,
  parseCourseNavigationMode,
  parseCourseTags,
} from "./course-action-input";

export async function updateCourse(courseId: string, formData: FormData) {
  const session = await requireManageCourse(courseId);
  const metadata = parseCourseMetadata(formData);
  const details = {
    title: asString(formData, "title"),
    description: asOptionalString(formData, "description"),
    requirements: asOptionalString(formData, "requirements"),
    targetAudience: asOptionalString(formData, "targetAudience"),
    category: metadata.category,
    difficultyLevel: metadata.difficultyLevel,
    durationMinutes: metadata.durationMinutes,
    tagsJson: parseCourseTags(formData),
    thumbnailUrl: metadata.thumbnailUrl,
    coverUrl: metadata.coverUrl,
    navigationMode: parseCourseNavigationMode(formData),
    resultViewMode: asString(formData, "resultViewMode"),
  };
  await manageCourseSettings.updateDetails({
    courseId,
    details,
    actor: await courseAuditActor(session.user),
  });
  revalidateCourse(courseId);
}

export async function updateCourseTitle(courseId: string, formData: FormData) {
  const session = await requireManageCourse(courseId);
  const result = await manageCourseSettings.updateTitle({
    courseId,
    title: asString(formData, "title"),
    actor: await courseAuditActor(session.user),
  });
  if (!result.changed) return;
  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
}

export async function updateCourseProgressionSettings(courseId: string, formData: FormData) {
  const session = await requireManageCourse(courseId);
  try {
    await manageCourseSettings.updateProgression({
      courseId,
      navigationMode: asString(formData, "navigationMode"),
      quizGateMode: asString(formData, "quizGateMode"),
      completionMode: asString(formData, "completionMode"),
      statusFormat: asString(formData, "statusFormat"),
      requestedRequiredItemIds: formData.getAll("requiredItemIds").map(String),
      requestedGradedItemIds: formData.getAll("gradedItemIds").map(String),
      actor: await courseAuditActor(session.user),
    });
  } catch (error) {
    redirectCourseStructureError(
      courseId,
      error instanceof Error ? error.message : "Проверьте настройки прохождения курса",
    );
  }
  revalidateCourse(courseId);
  redirect(manageCourseUrl(courseId, {
    section: "structure",
    structureSaved: "Настройки прохождения сохранены",
  }));
}

export async function updateCourseStatus(courseId: string, formData: FormData) {
  const session = await requirePublishCourse(courseId);
  let result;
  try {
    result = await manageCourseLifecycle.changeStatus({
      courseId,
      nextStatus: asString(formData, "status"),
      confirmedAssignedImpact: asString(formData, "confirmAssignedImpact") === "1",
      actor: await courseAuditActor(session.user),
    });
  } catch (error) {
    if (error instanceof CourseApplicationError) {
      redirect(manageCourseUrl(courseId, { statusError: error.message }));
    }
    throw error;
  }
  revalidateCourse(courseId);
  redirect(manageCourseUrl(courseId, {
    statusSaved: result.status === "PUBLISHED"
      ? "Курс опубликован"
      : result.status === "ARCHIVED"
        ? "Курс архивирован"
        : "Курс переведен в черновик",
  }));
}

export async function deleteCourse(courseId: string) {
  const session = await requireManageCourse(courseId);
  await manageCourseLifecycle.delete({
    courseId,
    actor: await courseAuditActor(session.user),
  });
  revalidatePath("/");
  revalidatePath("/courses");
  redirect("/courses");
}

async function courseAuditActor(user: { id: string; email?: string | null; name?: string | null }) {
  return {
    ...auditActorFromSessionUser(user),
    ...await getAuditRequestContext(),
  };
}

function revalidateCourse(courseId: string) {
  revalidatePath("/");
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/manage`);
}

function manageCourseUrl(courseId: string, params?: Record<string, string | undefined>) {
  const base = `/courses/${courseId}/manage`;
  if (!params) return base;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function redirectCourseStructureError(courseId: string, message: string): never {
  redirect(manageCourseUrl(courseId, { section: "structure", structureError: message }));
}
