import Link from "next/link";
import { type CourseAccessWindow } from "@/lib/course-access-window";
import { formatCourseDeadlineDate, getCourseDeadlineMeta } from "@/lib/course-deadline";
import {
  getCourseCategoryLabel,
  getCourseDifficultyLabel,
  isCourseCategory,
  isCourseDifficultyLevel,
} from "@/lib/course-metadata";
import { getCourseProgress } from "@/lib/course-progress";
import { type CourseOutlineEntry } from "@/lib/course-navigation";

// Общие типы и листовые компоненты/хелперы страницы /courses.
// Вынесены из page.tsx (был god-component на 2006 строк, ADR-013 IA-A):
// чистые, без session/prisma — переиспользуются тремя view (admin/hr/learner).

export type LearnerCourseState = "completed" | "in_progress" | "not_started";
export type AdminCourseView = "cards" | "list" | "table";

export type LearnerCourseListItem = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  progress: ReturnType<typeof getCourseProgress>;
  hasViews: boolean;
  state: LearnerCourseState;
  accessWindow: CourseAccessWindow | null;
  canOpenCourse: boolean;
  assignedAt: Date | null;
  deadlineAt: Date | null;
  lastActivityAt: Date | null;
  isInstructorAssigned: boolean;
  hasInstructorDeadline: boolean;
  isSelfSelectedFromCatalog: boolean;
  aboutHref: string;
  detailsHref: string;
  resumeHref: string;
  searchText: string;
};

export function EmptySearch({ q }: { q: string }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-black bg-white p-8 text-center">
      <p className="text-sm text-[var(--ink)]">
        {q ? `По запросу «${q}» ничего не найдено.` : "Список курсов пока пуст."}
      </p>
    </div>
  );
}

export function LearnerAssignedCourseCard({ course }: { course: LearnerCourseListItem }) {
  const isAccessExpired = !course.canOpenCourse && course.state !== "completed";
  const isCompleted = course.state === "completed";
  const actionLabel = getLearnerCourseActionLabel(course);
  const showProgress = course.state === "in_progress";
  const showStateLabel = isAccessExpired;
  const courseOverviewHref = course.canOpenCourse ? course.detailsHref : course.aboutHref;
  const cover = (
    <LearnerCourseCover
      coverUrl={course.coverUrl}
      title={course.title}
      meta={isAccessExpired ? "Срок истек" : course.hasViews ? "Продолжение" : "Назначено"}
      compact
      showMeta={false}
    />
  );

  return (
    <li
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
        isAccessExpired ? "border-[var(--danger)]" : "border-[var(--line)]"
      }`}
    >
      <div
        className={`grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)_280px] lg:items-center ${
          isAccessExpired ? "bg-[var(--danger-soft)]" : ""
        }`}
      >
        <Link
          href={courseOverviewHref}
          aria-label={`Открыть карточку курса «${course.title}»`}
          className="block rounded-lg transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
        >
          {cover}
        </Link>
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-xl font-semibold text-[var(--ink)]">
            <Link href={courseOverviewHref} className="transition hover:text-[var(--accent)]">
              {course.title}
            </Link>
          </h2>
          {course.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--ink-muted)]">{course.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {showStateLabel ? (
              <LearnerStateLabel
                state={course.state}
                hasViews={course.hasViews}
                isAccessExpired={isAccessExpired}
              />
            ) : null}
            <LearnerDeadlineBadge accessWindow={course.accessWindow} state={course.state} compact />
          </div>
        </div>

        <div className="min-w-0">
          {showProgress ? (
            <>
              <div className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--ink)]">
                <span>В процессе</span>
                <span className={isAccessExpired ? "text-[var(--danger)]" : "text-[var(--ink)]"}>{course.progress.percent}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[var(--line)]">
                <div
                  className={`h-2 rounded-full transition-all ${isAccessExpired ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                  style={{ width: `${course.progress.percent}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                <span>
                  {course.progress.completedRequired}/{course.progress.requiredTotal || 0} этапов завершено
                </span>
                <LearnerCourseAction course={course} label={actionLabel} isAccessExpired={isAccessExpired} />
              </div>
            </>
          ) : isCompleted ? (
            <div className="flex justify-end">
              <LearnerCourseStatusPill label="Завершен" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`text-sm font-medium ${isAccessExpired ? "text-[var(--danger)]" : "text-[var(--ink)]"}`}>
                {getLearnerCourseListStatus(course, isAccessExpired)}
              </span>
              <LearnerCourseAction course={course} label={actionLabel} isAccessExpired={isAccessExpired} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function LearnerCourseStatusPill({ label }: { label: string }) {
  return (
    <span className="text-sm font-medium text-[var(--ink)]">
      {label}
    </span>
  );
}

export function LearnerCourseAction({
  course,
  label,
  isAccessExpired,
}: {
  course: LearnerCourseListItem;
  label: string;
  isAccessExpired: boolean;
}) {
  const isQuizResumeHref = course.resumeHref.includes("/quiz/");

  if (course.canOpenCourse) {
    return (
      <Link
        href={course.resumeHref}
        prefetch={isQuizResumeHref ? false : undefined}
        className="inline-flex h-8 shrink-0 items-center rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-white shadow-sm shadow-emerald-900/10 transition hover:bg-[var(--accent-strong)]"
      >
        {label}
      </Link>
    );
  }

  if (isAccessExpired) {
    return (
      <Link
        href={course.aboutHref}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-[var(--danger)] bg-white px-3 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
      >
        {label}
      </Link>
    );
  }

  return (
    <span
      className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-medium ${
        isAccessExpired ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--surface)] text-[var(--ink-muted)]"
      }`}
    >
      {label}
    </span>
  );
}

export function ContinueLearningPanel({
  course,
  hasAssignedCourses,
  forceLearnerMode,
}: {
  course: LearnerCourseListItem | null;
  hasAssignedCourses: boolean;
  forceLearnerMode: boolean;
}) {
  if (!course) {
    return (
      <div className="flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Продолжить обучение</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {hasAssignedCourses
              ? "Сейчас нет активных курсов для продолжения. Проверьте просроченные назначения ниже."
              : "Назначенных курсов пока нет. Можно посмотреть открытый каталог."}
          </p>
        </div>
        <Link
          href={buildLearnerCoursesHref({ tab: "catalog", forceLearnerMode })}
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
        >
          Открыть каталог
        </Link>
      </div>
    );
  }

  return (
    <ul>
      <LearnerAssignedCourseCard course={course} />
    </ul>
  );
}

export function LearnerTabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition ${
        active
          ? "bg-white text-[var(--ink)] shadow-[inset_0_-3px_0_var(--ink)]"
          : "text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </Link>
  );
}

export function LearnerCourseCover({
  coverUrl,
  title,
  meta,
  compact = false,
  showMeta = true,
}: {
  coverUrl: string | null;
  title: string;
  meta: string;
  compact?: boolean;
  showMeta?: boolean;
}) {
  const textTone = coverUrl ? "text-white" : "text-[var(--ink)]";
  const metaTone = coverUrl
    ? "bg-white/20 text-white backdrop-blur"
    : "bg-white/80 text-[var(--ink)] shadow-sm";

  return (
    <div
      className={`relative overflow-hidden bg-[var(--accent-soft)] ${
        compact ? "h-32 rounded-lg lg:h-28" : "h-36"
      }`}
      style={
        coverUrl
          ? {
              backgroundImage: `linear-gradient(rgba(9, 30, 58, 0.12), rgba(9, 30, 58, 0.28)), url("${coverUrl}")`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }
          : undefined
      }
    >
      {!coverUrl ? (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--accent-soft)_0%,var(--accent-soft)_55%,var(--surface)_100%)]" />
      ) : null}
      {showMeta || !compact ? (
        <div className={`absolute inset-x-0 bottom-0 p-4 ${textTone}`}>
          {showMeta ? (
            <div className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${metaTone}`}>
              {meta}
            </div>
          ) : null}
          {!compact ? (
            <div
              className={`${showMeta ? "mt-2" : ""} line-clamp-1 text-sm font-medium ${
                coverUrl ? "text-white/90" : "text-[var(--ink)]"
              }`}
            >
              {title}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LearnerRatingBadge({
  rating,
  reviewsCount,
}: {
  rating: number | null;
  reviewsCount: number;
}) {
  return (
    <div className="shrink-0 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-right">
      <div className="text-sm font-semibold text-[var(--accent)]">
        {rating === null ? "Нет оценок" : `${rating}/5`}
      </div>
      <div className="mt-1 text-xs text-[var(--accent)]">
        {reviewsCount > 0 ? `${reviewsCount} отзывов` : "Новый курс"}
      </div>
    </div>
  );
}

export function LearnerAccessBadge({
  assigned,
  state,
  accessWindow,
}: {
  assigned: boolean;
  state: LearnerCourseState | null;
  accessWindow: CourseAccessWindow | null;
}) {
  const isExpired = assigned && accessWindow?.isActive === false && state !== "completed";

  return (
    <span
      className={`inline-flex shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
        isExpired
          ? "bg-[var(--danger-soft)] text-[var(--danger)]"
          : assigned
            ? "bg-[var(--success-soft)] text-[var(--success)]"
            : "bg-[var(--warning-soft)] text-[var(--warning)]"
      }`}
    >
      {isExpired ? "Просрочено" : assigned ? getLearnerCatalogAssignmentLabel(state) : "После назначения"}
    </span>
  );
}

export function LearnerDeadlineBadge({
  accessWindow,
  state,
  compact = false,
  hideNeutral = false,
}: {
  accessWindow: CourseAccessWindow | null;
  state: LearnerCourseState;
  compact?: boolean;
  hideNeutral?: boolean;
}) {
  const meta = getCourseDeadlineMeta(accessWindow, state === "completed");
  if (hideNeutral && meta.tone === "neutral") return null;
  const label = getLearnerDeadlineCardLabel(accessWindow, state, meta);

  const toneClass =
    meta.tone === "danger"
      ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : meta.tone === "warning"
        ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
        : meta.tone === "success"
          ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
          : meta.tone === "info"
            ? "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]"
            : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]";

  return (
    <div
      title={meta.description}
      className={`inline-flex whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium ${
        compact ? "" : "mt-3"
      } ${toneClass}`}
    >
      {label}
    </div>
  );
}

export function getLearnerDeadlineCardLabel(
  accessWindow: CourseAccessWindow | null,
  state: LearnerCourseState,
  meta: ReturnType<typeof getCourseDeadlineMeta>
) {
  if (meta.isUnlimited) return "Срок доступа: бессрочно";
  if (meta.isExpired) return meta.compactLabel;
  if (state === "completed") return meta.compactLabel;
  if (accessWindow?.expiresAt) return `Срок доступа: до ${formatCourseDeadlineDate(accessWindow.expiresAt)}`;
  return meta.compactLabel;
}

export function LearnerStateLabel({
  state,
  hasViews,
  isAccessExpired = false,
}: {
  state: LearnerCourseState;
  hasViews: boolean;
  isAccessExpired?: boolean;
}) {
  const label =
    isAccessExpired && state !== "completed"
      ? "Просрочено"
      : state === "completed"
      ? "Курс завершен"
      : state === "in_progress"
        ? "Продолжить изучение"
        : hasViews
          ? "Ранее открывали"
          : "Назначенный курс";

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${
        isAccessExpired && state !== "completed" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--surface)] text-[var(--ink-muted)]"
      }`}
    >
      {label}
    </span>
  );
}

export function LearnerEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-white p-8 text-center shadow-sm">
      <p className="text-sm text-[var(--ink)]">{message}</p>
    </div>
  );
}

export function getLearnerCourseActionLabel(course: LearnerCourseListItem) {
  if (!course.canOpenCourse) return "О курсе";
  if (course.state === "completed") return "Открыть курс";
  if (course.state === "not_started") return "Начать курс";
  return "Продолжить";
}

export function getLearnerCourseListStatus(course: LearnerCourseListItem, isAccessExpired: boolean) {
  if (isAccessExpired) return "Просрочено";
  if (course.state === "completed") return "Завершен";
  if (course.state === "not_started") return "Не начат";
  return "В процессе";
}

export function HrMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
      <div className="mt-1 text-sm text-[var(--ink-muted)]">{label}</div>
    </div>
  );
}

export function AdminStatusTile({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`min-w-0 rounded-xl border px-4 py-4 transition 2xl:px-3 ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      <div className="min-w-0 break-words text-sm leading-tight">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{count}</div>
    </Link>
  );
}

export function AdminCourseStatusBadge({ status }: { status: string }) {
  const tone =
    status === "PUBLISHED"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : status === "ARCHIVED"
        ? "bg-[var(--line)] text-[var(--ink)]"
        : "bg-[var(--warning-soft)] text-[var(--warning)]";
  const label = status === "PUBLISHED" ? "Опубликован" : status === "ARCHIVED" ? "Архив" : "Черновик";

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>
  );
}

export function getAdminStatusParam(value?: string) {
  if (value === "all" || value === "draft" || value === "published" || value === "archived") return value;
  return "all";
}

export function getAdminViewParam(value?: string): AdminCourseView {
  if (value === "cards" || value === "list") return value;
  return "table";
}

export function buildAdminCoursesHref({
  q,
  status,
  view,
}: {
  q: string;
  status: "all" | "draft" | "published" | "archived";
  view: AdminCourseView;
}) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (view !== "table") params.set("view", view);

  const query = params.toString();
  return query ? `/courses?${query}` : "/courses";
}

export function buildCourseReportExportHref(courseId: string, format: "csv" | "xlsx") {
  const params = new URLSearchParams();
  if (format !== "csv") params.set("format", format);
  const query = params.toString();
  return query ? `/courses/${courseId}/results/export?${query}` : `/courses/${courseId}/results/export`;
}

export function buildAdminCourseCardHref(courseId: string) {
  return `/courses/${courseId}/manage?section=structure`;
}

export function getLearnerSearchTerms(value: string) {
  return normalizeLearnerSearchText(value)
    .split(/\s+/)
    .filter(Boolean);
}

export function matchesLearnerCourseSearch(course: LearnerCourseListItem, terms: string[]) {
  return terms.every((term) => course.searchText.includes(term));
}

export function buildLearnerCourseSearchText({
  title,
  description,
  category,
  difficultyLevel,
}: {
  title: string;
  description: string | null;
  category: string | null;
  difficultyLevel: string | null;
}) {
  const values = [
    title,
    description,
    category,
    category && isCourseCategory(category) ? getCourseCategoryLabel(category) : null,
    difficultyLevel,
    difficultyLevel && isCourseDifficultyLevel(difficultyLevel) ? getCourseDifficultyLabel(difficultyLevel) : null,
  ];

  return normalizeLearnerSearchText(values.filter(Boolean).join(" "));
}

export function normalizeLearnerSearchText(value: string) {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim();
}

export function compareLearnerCourses(left: LearnerCourseListItem, right: LearnerCourseListItem) {
  const groupDiff = getLearnerCourseSortGroup(left) - getLearnerCourseSortGroup(right);
  if (groupDiff !== 0) return groupDiff;

  if (left.lastActivityAt || right.lastActivityAt) {
    const activityDiff = compareOptionalDateDesc(left.lastActivityAt, right.lastActivityAt);
    if (activityDiff !== 0) return activityDiff;
  }

  if (left.deadlineAt || right.deadlineAt) {
    const deadlineDiff = compareOptionalDateAsc(left.deadlineAt, right.deadlineAt);
    if (deadlineDiff !== 0) return deadlineDiff;
  }

  const assignedDiff = compareOptionalDateDesc(left.assignedAt, right.assignedAt);
  if (assignedDiff !== 0) return assignedDiff;

  return left.title.localeCompare(right.title, "ru");
}

export function getLearnerCourseSortGroup(course: LearnerCourseListItem) {
  if (course.canOpenCourse && course.state !== "completed" && course.lastActivityAt) return 0;
  if (course.canOpenCourse && course.state !== "completed" && course.hasInstructorDeadline) return 1;
  if (course.canOpenCourse && course.state !== "completed" && course.isSelfSelectedFromCatalog) return 2;
  if (course.canOpenCourse && course.state !== "completed") return 3;
  if (course.state === "completed") return 4;
  return 5;
}

export function getLearnerAssignmentSortMeta(
  directAssignments: Array<{ assignedAt: Date; assignedById: string | null; expiresAt: Date | null }>,
  inheritedAssignments: Array<{ assignedAt: Date; assignedById: string | null; expiresAt: Date | null }>,
  accessWindow: CourseAccessWindow | null
) {
  const assignments = [...directAssignments, ...inheritedAssignments];
  const assignedAt = getEarliestDate(assignments.map((assignment) => assignment.assignedAt));
  const hasInstructorAssignment = assignments.some((assignment) => Boolean(assignment.assignedById));
  const hasDirectSelfAssignment =
    directAssignments.length > 0 && directAssignments.every((assignment) => !assignment.assignedById);

  return {
    assignedAt,
    deadlineAt: accessWindow?.expiresAt ?? null,
    hasInstructorAssignment,
    hasInstructorDeadline: hasInstructorAssignment && Boolean(accessWindow?.expiresAt),
    isSelfSelectedFromCatalog: hasDirectSelfAssignment && inheritedAssignments.length === 0,
  };
}

export function getLearnerCourseLastActivityAt(
  learnerStateUpdatedAt: Date | null,
  items: Array<{
    views: Array<{ viewedAt?: Date | null }>;
    quiz?: { attempts?: Array<{ completedAt?: Date | null }> } | null;
  }>
) {
  const activityDates = [
    learnerStateUpdatedAt,
    ...items.flatMap((item) => [
      ...item.views.map((view) => view.viewedAt ?? null),
      ...(item.quiz?.attempts ?? []).map((attempt) => attempt.completedAt ?? null),
    ]),
  ];

  return getLatestDate(activityDates);
}

export function getEarliestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((earliest, value) => {
    if (!value) return earliest;
    if (!earliest || value.getTime() < earliest.getTime()) return value;
    return earliest;
  }, null);
}

export function getLatestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    if (!latest || value.getTime() > latest.getTime()) return value;
    return latest;
  }, null);
}

export function compareOptionalDateAsc(left: Date | null, right: Date | null) {
  if (left && right) return left.getTime() - right.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function compareOptionalDateDesc(left: Date | null, right: Date | null) {
  if (left && right) return right.getTime() - left.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function learnerCourseAssignmentWhere(userId: string) {
  const now = new Date();
  const activeAccessWhere = {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  return {
    OR: [
      {
        directAssignments: {
          some: {
            userId,
            ...activeAccessWhere,
          },
        },
      },
      {
        AND: [
          {
            directAssignments: {
              none: { userId },
            },
          },
          {
            groupAssignments: {
              some: {
                ...activeAccessWhere,
                group: {
                  memberships: {
                    some: { userId },
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
}

export function getHrCategoryParam(value?: string) {
  if (value && isCourseCategory(value)) return value;
  return undefined;
}

export function getHrDifficultyParam(value?: string) {
  if (value && isCourseDifficultyLevel(value)) return value;
  return undefined;
}

export function getLearnerTabParam(value?: string) {
  if (value === "catalog" || value === "assigned" || value === "completed") return value;
  return undefined;
}

export function getLearnerCatalogDurationParam(value?: string) {
  if (value === "short" || value === "medium" || value === "long") return value;
  return "all";
}

export function getLearnerCatalogRatingParam(value?: string) {
  if (value === "4plus" || value === "3plus") return value;
  return "all";
}

export function buildLearnerCoursesHref({
  tab,
  q,
  category,
  difficulty,
  duration,
  rating,
  forceLearnerMode = false,
}: {
  tab: "catalog" | "assigned" | "completed";
  q?: string;
  category?: string;
  difficulty?: string;
  duration?: "all" | "short" | "medium" | "long";
  rating?: "all" | "4plus" | "3plus";
  forceLearnerMode?: boolean;
}) {
  const params = new URLSearchParams();

  if (tab !== "assigned" || forceLearnerMode) params.set("tab", tab);

  if (tab === "catalog") {
    if (category) params.set("category", category);
    if (difficulty) params.set("difficulty", difficulty);
    if (duration && duration !== "all") params.set("duration", duration);
    if (rating && rating !== "all") params.set("rating", rating);
  } else if (q) {
    params.set("q", q);
  }

  const query = params.toString();
  return query ? `/courses?${query}` : "/courses";
}

export function pickLearnerResumeEntry(outline: CourseOutlineEntry[], lastOpenedItemId: string | null) {
  const inProgress = outline.find((item) => !item.isLocked && !item.isCompleted && item.progressPercent > 0);
  if (inProgress) return inProgress;

  const lastOpened = lastOpenedItemId
    ? outline.find((item) => item.id === lastOpenedItemId && !item.isLocked && !item.isCompleted) ?? null
    : null;
  if (lastOpened) return lastOpened;

  const firstIncomplete = outline.find((item) => !item.isLocked && !item.isCompleted);
  if (firstIncomplete) return firstIncomplete;

  return outline.find((item) => !item.isLocked) ?? outline[0] ?? null;
}

export function buildLearnerCourseDetailsHref(courseId: string, forceContentView = false) {
  if (!forceContentView) return `/courses/${courseId}`;

  const params = new URLSearchParams({ view: "content", from: "assigned" });
  return `/courses/${courseId}?${params.toString()}`;
}

export function buildLearnerCourseAboutHref(courseId: string) {
  return `/courses/${courseId}/about`;
}

export function buildLearnerCourseResumeHref(
  courseId: string,
  entry: CourseOutlineEntry | null,
  forceContentView = false,
) {
  if (!entry) return buildLearnerCourseDetailsHref(courseId, forceContentView);

  if (entry.type === "QUIZ" && entry.quiz?.id) {
    return `/courses/${courseId}/quiz/${entry.quiz.id}`;
  }
  if (entry.type === "SURVEY") {
    return `/courses/${courseId}/survey/${entry.id}`;
  }

  const params = new URLSearchParams({ item: entry.id, resume: "1" });
  if (forceContentView) {
    params.set("view", "content");
    params.set("from", "assigned");
  }
  return `/courses/${courseId}?${params.toString()}#lesson-content`;
}

export function getCourseAverageRating(feedbacks: Array<{ rating: number }>) {
  if (feedbacks.length === 0) return null;
  return Number((feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0) / feedbacks.length).toFixed(1));
}

export function matchesLearnerCatalogDuration(
  durationMinutes: number | null | undefined,
  filter: ReturnType<typeof getLearnerCatalogDurationParam>
) {
  if (filter === "all") return true;
  if (!durationMinutes || durationMinutes < 1) return false;
  if (filter === "short") return durationMinutes <= 60;
  if (filter === "medium") return durationMinutes > 60 && durationMinutes <= 180;
  return durationMinutes > 180;
}

export function matchesLearnerCatalogRating(
  averageRating: number | null,
  filter: ReturnType<typeof getLearnerCatalogRatingParam>
) {
  if (filter === "all") return true;
  if (averageRating === null) return false;
  if (filter === "4plus") return averageRating >= 4;
  return averageRating >= 3;
}

export function getLearnerCatalogAssignmentLabel(
  state: LearnerCourseState | null
) {
  if (state === "completed") return "Курс завершен";
  if (state === "in_progress") return "Можно продолжить";
  return "Уже назначен";
}

export function formatAdminDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export function getLearnerCourseState(progress: ReturnType<typeof getCourseProgress>): LearnerCourseState {
  if (progress.requiredTotal > 0 && progress.completedRequired >= progress.requiredTotal) return "completed";
  if (progress.percent > 0) return "in_progress";
  return "not_started";
}
