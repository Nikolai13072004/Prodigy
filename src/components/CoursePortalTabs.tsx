import Link from "next/link";
import { appendCourseReturnSource, type CourseReturnSource } from "@/lib/course-return-source";

export type CoursePortalTab = "content" | "about" | "feedback" | "survey";

type Props = {
  courseId: string;
  active: CoursePortalTab;
  contentHref?: string;
  contentDisabled?: boolean;
  returnSource?: CourseReturnSource | null;
  showFeedback?: boolean;
  feedbackCount?: number;
  showSurvey?: boolean;
};

export function CoursePortalTabs({
  courseId,
  active,
  contentHref = `/courses/${courseId}`,
  contentDisabled = false,
  returnSource = null,
  showFeedback = true,
  feedbackCount = 0,
  showSurvey = false,
}: Props) {
  const tabs = [
    { key: "content" as const, label: "Содержание", href: appendCourseReturnSource(contentHref, returnSource) },
    {
      key: "about" as const,
      label: "О курсе",
      href: appendCourseReturnSource(`/courses/${courseId}/about`, returnSource),
    },
    ...(showFeedback
      ? [
          {
            key: "feedback" as const,
            label: feedbackCount > 0 ? `Отзывы (${feedbackCount})` : "Отзывы",
            href: appendCourseReturnSource(`/courses/${courseId}/feedback`, returnSource),
          },
        ]
      : []),
    ...(showSurvey
      ? [
          {
            key: "survey" as const,
            label: "Опрос",
            href: appendCourseReturnSource(`/courses/${courseId}/survey`, returnSource),
          },
        ]
      : []),
  ];

  return (
    <nav className="bg-[var(--surface-raised)] px-4 sm:px-5" aria-label="Разделы курса">
      <div className="flex flex-wrap gap-2 py-3">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          const isDisabled = tab.key === "content" && contentDisabled;
          const className = `px-4 py-2 text-sm font-medium transition ${
            isActive
              ? "text-[var(--accent)] shadow-[inset_0_-3px_0_var(--accent)]"
              : isDisabled
                ? "cursor-not-allowed text-[var(--ink-muted)]"
                : "text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
          }`;

          if (isDisabled) {
            return (
              <span
                key={tab.key}
                aria-disabled="true"
                title="Доступ к содержанию откроется после назначения курса"
                className={className}
              >
                {tab.label}
              </span>
            );
          }

          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={className}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
