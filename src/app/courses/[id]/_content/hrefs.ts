import { appendCourseReturnSource, type CourseReturnSource } from "@/lib/course-return-source";
import { type CourseOutlineEntry } from "@/lib/course-navigation";

// Чистые построители ссылок для страницы курса (контент, продолжение, переход).
// Вынесены из page.tsx без изменения поведения.

export function buildCourseItemHref(
  courseId: string,
  itemId: string | null,
  view: string | undefined,
  returnSource: CourseReturnSource | null,
  asLearnerPreview = false
) {
  const params = new URLSearchParams();
  if (itemId) params.set("item", itemId);
  if (view) params.set("view", view);
  if (returnSource) params.set("from", returnSource);
  if (asLearnerPreview) params.set("asLearner", "1");
  const suffix = params.toString();
  return suffix ? `/courses/${courseId}?${suffix}` : `/courses/${courseId}`;
}

export function buildCourseEntryResumeHref(
  courseId: string,
  entry: CourseOutlineEntry,
  view: string | undefined,
  returnSource: CourseReturnSource | null,
  asLearnerPreview = false
) {
  if (entry.type === "QUIZ" && entry.quiz?.id) {
    if (asLearnerPreview) return `/courses/${courseId}/quiz/${entry.quiz.id}/builder/preview`;
    return appendCourseReturnSource(`/courses/${courseId}/quiz/${entry.quiz.id}`, returnSource);
  }
  if (entry.type === "SURVEY") {
    if (asLearnerPreview) return buildCourseItemHref(courseId, entry.id, view, returnSource, true);
    return appendCourseReturnSource(`/courses/${courseId}/survey/${entry.id}`, returnSource);
  }

  const params = new URLSearchParams();
  params.set("item", entry.id);
  params.set("resume", "1");
  if (view) params.set("view", view);
  if (returnSource) params.set("from", returnSource);
  if (asLearnerPreview) params.set("asLearner", "1");
  return `/courses/${courseId}?${params.toString()}`;
}

export function buildCourseEntryHref(
  courseId: string,
  entry: CourseOutlineEntry,
  view: string | undefined,
  returnSource: CourseReturnSource | null,
  asLearnerPreview = false
) {
  if (entry.type === "QUIZ" && entry.quiz?.id) {
    if (asLearnerPreview) return `/courses/${courseId}/quiz/${entry.quiz.id}/builder/preview`;
    return appendCourseReturnSource(`/courses/${courseId}/quiz/${entry.quiz.id}`, returnSource);
  }
  if (entry.type === "SURVEY") {
    if (asLearnerPreview) return buildCourseItemHref(courseId, entry.id, view, returnSource, true);
    return appendCourseReturnSource(`/courses/${courseId}/survey/${entry.id}`, returnSource);
  }
  return buildCourseItemHref(courseId, entry.id, view, returnSource, asLearnerPreview);
}
