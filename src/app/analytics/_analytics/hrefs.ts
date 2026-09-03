import { type HrCourseAnalyticsStatusFilter } from "@/lib/hr-course-analytics";

// Построители ссылок HR-аналитики. Вынесены из page.tsx без изменений.

export function buildHrAnalyticsHref(args: { q?: string; status?: HrCourseAnalyticsStatusFilter }) {
  const params = new URLSearchParams({ tab: "courses" });
  if (args.q?.trim()) params.set("q", args.q.trim());
  if (args.status && args.status !== "all") params.set("status", args.status);
  return `/analytics?${params.toString()}`;
}

export function buildHrCourseLearnersHref(args: {
  courseId: string;
  status?: "all" | "in_progress" | "completed" | "not_started";
  access?: "all" | "active" | "expired";
}) {
  const params = new URLSearchParams();
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.access && args.access !== "all") params.set("access", args.access);
  const query = params.toString();
  return query ? `/courses/${args.courseId}/learners?${query}` : `/courses/${args.courseId}/learners`;
}
