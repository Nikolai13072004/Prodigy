import Link from "next/link";
import { AdminViewPreferenceLink } from "@/app/courses/AdminViewPreferenceLink";
import { LearnerCourseSearch } from "@/components/LearnerCourseSearch";
import { requireSession } from "@/lib/auth-guards";
import { resolveEffectiveCourseAccessWindow, type CourseAccessWindow } from "@/lib/course-access-window";
import { formatCourseDeadlineDate, getCourseDeadlineMeta } from "@/lib/course-deadline";
import { getUniqueEnrolledLearnersCount } from "@/lib/course-enrollment";
import {
  COURSE_CATEGORY_OPTIONS,
  COURSE_DIFFICULTY_OPTIONS,
  formatCourseDuration,
  getCourseCategoryLabel,
  getCourseDifficultyLabel,
  isCourseCategory,
  isCourseDifficultyLevel,
} from "@/lib/course-metadata";
import { isPublishedSnapshotActive, parsePublishedCourseSnapshot } from "@/lib/course-content";
import { buildCourseOutline, type CourseOutlineEntry } from "@/lib/course-navigation";
import { getCourseProgress } from "@/lib/course-progress";
import type { CourseNavigationMode, CourseQuizGateMode } from "@/lib/constants";
import { getPlatformSettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, STANDARD_ROLE_NAMES, hasPermission, hasRole } from "@/lib/roles";

type Props = {
  searchParams: Promise<{
    q?: string;
    tab?: string;
    status?: string;
    view?: string;
    category?: string;
    difficulty?: string;
    duration?: string;
    rating?: string;
  }>;
};

type LearnerCourseState = "completed" | "in_progress" | "not_started";
type AdminCourseView = "cards" | "list" | "table";

type LearnerCourseListItem = {
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

export default async function CoursesPage({ searchParams }: Props) {
  const session = await requireSession();
  const platformSettings = await getPlatformSettings();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const requestedLearnerTab = getLearnerTabParam(sp.tab);
  const learnerTab = requestedLearnerTab ?? "assigned";
  const adminStatus = getAdminStatusParam(sp.status);
  const hrCategory = getHrCategoryParam(sp.category);
  const hrDifficulty = getHrDifficultyParam(sp.difficulty);
  const learnerDuration = getLearnerCatalogDurationParam(sp.duration);
  const learnerRating = getLearnerCatalogRatingParam(sp.rating);
  const uiPreference = await prisma.userUiPreference.findUnique({
    where: { userId: session.user.id },
    select: { adminCoursesView: true, preferredRole: true },
  });
  const sessionRoles = session.user.roles?.length
    ? session.user.roles
    : session.user.role
      ? [session.user.role]
      : [];
  const preferredRole =
    uiPreference?.preferredRole && sessionRoles.includes(uiPreference.preferredRole)
      ? uiPreference.preferredRole
      : null;
  const learnerRole =
    requestedLearnerTab && sessionRoles.includes(STANDARD_ROLE_NAMES.STUDENT)
      ? STANDARD_ROLE_NAMES.STUDENT
      : null;
  const activeRole = learnerRole ?? preferredRole;
  const activeRoles = activeRole ? [activeRole] : sessionRoles;
  const activeRolePermissions =
    activeRole && ROLE_PERMISSIONS[activeRole] ? undefined : session.user.permissions;
  const canViewCourses = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_VIEW,
    activeRolePermissions
  );
  const canCreateCourses = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_CREATE_EDIT,
    activeRolePermissions
  );
  const canPublishCourses = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_PUBLISH,
    activeRolePermissions
  );
  const canManageAssignments = hasPermission(
    activeRoles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    activeRolePermissions
  );
  const canTakeKnowledgeCheck = hasPermission(
    activeRoles,
    PERMISSIONS.LEARNING_KNOWLEDGE_CHECK,
    activeRolePermissions
  );
  const isHrDashboard = canManageAssignments && !canCreateCourses && !canPublishCourses && canViewCourses;
  const isStudentRole =
    hasRole(activeRoles, STANDARD_ROLE_NAMES.STUDENT) ||
    hasRole(activeRoles, ROLES.STUDENT);
  const shouldShowAdminCourses =
    canCreateCourses ||
    canPublishCourses ||
    (canViewCourses && !canTakeKnowledgeCheck && !isHrDashboard && !isStudentRole);
  const shouldUseLearnerCoursesView = isStudentRole && Boolean(requestedLearnerTab);

  if (shouldShowAdminCourses && !shouldUseLearnerCoursesView) {
    const adminView = getAdminViewParam(sp.view ?? uiPreference?.adminCoursesView);

    const rawCourses = await prisma.course.findMany({
      where: q
        ? {
            OR: [{ title: { contains: q } }, { description: { contains: q } }],
          }
        : undefined,
      orderBy: { updatedAt: "desc" },
      include: {
        owner: {
          select: {
            name: true,
            login: true,
          },
        },
        directAssignments: {
          select: { userId: true, expiresAt: true },
        },
        groupAssignments: {
          select: {
            expiresAt: true,
            group: {
              select: {
                memberships: {
                  select: { userId: true },
                },
              },
            },
          },
        },
        _count: {
          select: {
            items: true,
            feedbacks: true,
          },
        },
      },
    });

    const courses = rawCourses.map((course) => ({
      ...course,
      enrolledLearnersCount: getUniqueEnrolledLearnersCount(course),
    }));

    const publishedCount = courses.filter((course) => course.status === "PUBLISHED").length;
    const archivedCount = courses.filter((course) => course.status === "ARCHIVED").length;
    const draftCount = courses.filter(
      (course) => course.status !== "PUBLISHED" && course.status !== "ARCHIVED"
    ).length;
    const visibleAdminCourses =
      adminStatus === "published"
        ? courses.filter((course) => course.status === "PUBLISHED")
        : adminStatus === "draft"
          ? courses.filter((course) => course.status !== "PUBLISHED" && course.status !== "ARCHIVED")
          : adminStatus === "archived"
            ? courses.filter((course) => course.status === "ARCHIVED")
            : courses;

    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Курсы</h1>
            <p className="text-sm text-[var(--ink-muted)]">
              {q ? `Результаты поиска по запросу «${q}»` : "Рабочее место администратора курсов"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--ink-muted)]">
              {courses.length ? `Всего курсов: ${courses.length}` : "Нет курсов"}
            </div>
            {canCreateCourses && (
              <Link
                href="/courses/new"
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
              >
                Новый курс
              </Link>
            )}
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
            <div className="grid min-w-0 gap-3 sm:grid-cols-4">
              <AdminStatusTile
                href={buildAdminCoursesHref({ q, status: "all", view: adminView })}
                label="Все курсы"
                count={courses.length}
                active={adminStatus === "all"}
              />
              <AdminStatusTile
                href={buildAdminCoursesHref({ q, status: "draft", view: adminView })}
                label="Черновики"
                count={draftCount}
                active={adminStatus === "draft"}
              />
              <AdminStatusTile
                href={buildAdminCoursesHref({ q, status: "published", view: adminView })}
                label="Опубликованы"
                count={publishedCount}
                active={adminStatus === "published"}
              />
              <AdminStatusTile
                href={buildAdminCoursesHref({ q, status: "archived", view: adminView })}
                label="Архив"
                count={archivedCount}
                active={adminStatus === "archived"}
              />
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 2xl:justify-end">
              <div className="flex flex-wrap gap-2">
                <AdminViewPreferenceLink
                  href={buildAdminCoursesHref({ q, status: adminStatus, view: "cards" })}
                  active={adminView === "cards"}
                  label="Плитки"
                  view="cards"
                />
                <AdminViewPreferenceLink
                  href={buildAdminCoursesHref({ q, status: adminStatus, view: "list" })}
                  active={adminView === "list"}
                  label="Список"
                  view="list"
                />
                <AdminViewPreferenceLink
                  href={buildAdminCoursesHref({ q, status: adminStatus, view: "table" })}
                  active={adminView === "table"}
                  label="Таблица"
                  view="table"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">
                {adminStatus === "draft"
                  ? "Черновики"
                  : adminStatus === "published"
                    ? "Опубликованные курсы"
                    : adminStatus === "archived"
                      ? "Архивные курсы"
                    : "Все курсы"}
              </h2>
              <p className="text-sm text-[var(--ink-muted)]">
                {visibleAdminCourses.length
                  ? `${visibleAdminCourses.length} в текущем представлении`
                  : q
                    ? "Поиск не дал результатов"
                    : "Список пока пуст"}
              </p>
            </div>

            <form action="/courses" className="w-full sm:w-80">
              <input type="hidden" name="status" value={adminStatus} />
              <input type="hidden" name="view" value={adminView} />
              <label className="sr-only" htmlFor="admin-course-search">
                Поиск курса
              </label>
              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  id="admin-course-search"
                  name="q"
                  defaultValue={q}
                  placeholder="Поиск по курсам..."
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white pl-9 pr-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                />
              </div>
            </form>
          </div>

          {visibleAdminCourses.length === 0 ? (
            <EmptySearch q={q} />
          ) : adminView === "table" ? (
            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--line)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] border-collapse text-sm">
                  <thead className="bg-[var(--surface)] text-[11px] leading-none text-[var(--ink-muted)]">
                    <tr>
                      <th className="hidden h-12 whitespace-nowrap px-4 py-2 align-middle text-left font-medium">ID</th>
                      <th className="h-12 min-w-[360px] whitespace-nowrap px-4 py-2 align-middle text-left font-medium">Курс</th>
                      <th className="h-12 min-w-[120px] whitespace-nowrap px-4 py-2 align-middle text-left font-medium">Автор</th>
                      <th className="h-12 min-w-[112px] whitespace-nowrap px-4 py-2 align-middle text-left font-medium">Статус</th>
                      <th className="h-12 w-24 whitespace-nowrap px-4 py-2 align-middle text-center font-medium">Элементы</th>
                      <th className="h-12 w-24 whitespace-nowrap px-4 py-2 align-middle text-center font-medium" title="Записано учеников">Ученики</th>
                      <th className="h-12 w-28 whitespace-nowrap px-4 py-2 align-middle text-left font-medium" title="Дата создания">Создан</th>
                      <th className="h-12 w-24 whitespace-nowrap px-4 py-2 align-middle text-right font-medium">Переход</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAdminCourses.map((course) => (
                      <tr key={course.id} className="border-t border-[var(--line)] text-[var(--ink)] hover:bg-[var(--accent-soft)]">
                        <td className="hidden px-4 py-3 align-top font-mono text-xs text-[var(--ink-muted)]">{course.id}</td>
                        <td className="px-4 py-3 align-top">
                          <Link
                            href={buildAdminCourseCardHref(course.id)}
                            className="block rounded-lg transition hover:text-[var(--accent)]"
                          >
                            <div className="font-medium text-[var(--ink)] hover:text-[var(--accent)]">{course.title}</div>
                            <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-muted)]">
                              {course.description || "Описание пока не добавлено"}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-[var(--ink)]">{course.owner?.name ?? "Не назначен"}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <AdminCourseStatusBadge status={course.status} />
                        </td>
                        <td className="px-4 py-3 text-center align-top">{course._count.items}</td>
                        <td className="px-4 py-3 text-center align-top">
                          {course.enrolledLearnersCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-[var(--ink-muted)]">
                          {formatAdminDate(course.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <Link
                            href={`/courses/${course.id}/learners`}
                            className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]"
                          >
                            Ученики
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : adminView === "list" ? (
            <ul className="mt-5 space-y-3">
              {visibleAdminCourses.map((course) => (
                <li key={course.id}>
                  <Link
                    href={buildAdminCourseCardHref(course.id)}
                    className="block rounded-xl border border-[var(--line)] bg-white px-4 py-4 transition hover:border-[var(--line)] hover:bg-[var(--accent-soft)]"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[var(--ink)]">{course.title}</h3>
                          <AdminCourseStatusBadge status={course.status} />
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-muted)]">
                          {course.description || "Описание пока не добавлено"}
                        </p>
                      </div>

                      <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm text-[var(--ink-muted)] sm:grid-cols-4 lg:text-right">
                        <div>
                          <dt>Автор</dt>
                          <dd className="font-medium text-[var(--ink)]">{course.owner?.name ?? "Не назначен"}</dd>
                        </div>
                        <div>
                          <dt>Элементы</dt>
                          <dd className="font-medium text-[var(--ink)]">{course._count.items}</dd>
                        </div>
                        <div>
                          <dt>Записано учеников</dt>
                          <dd className="font-medium text-[var(--ink)]">{course.enrolledLearnersCount}</dd>
                        </div>
                        <div>
                          <dt>Дата создания</dt>
                          <dd className="font-medium text-[var(--ink)]">{formatAdminDate(course.createdAt)}</dd>
                        </div>
                      </dl>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleAdminCourses.map((course) => (
                <li key={course.id}>
                  <Link
                    href={buildAdminCourseCardHref(course.id)}
                    className="block h-full rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm transition hover:border-[var(--line)] hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 flex-1 text-base font-semibold text-[var(--ink)]">{course.title}</h3>
                      <AdminCourseStatusBadge status={course.status} />
                    </div>

                    <p className="mt-3 line-clamp-3 text-sm text-[var(--ink-muted)]">
                      {course.description || "Описание пока не добавлено"}
                    </p>

                    <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
                        <dt className="text-[var(--ink-muted)]">Автор</dt>
                        <dd className="mt-1 font-semibold text-[var(--ink)]">{course.owner?.name ?? "Не назначен"}</dd>
                      </div>
                      <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
                        <dt className="text-[var(--ink-muted)]">Элементы</dt>
                        <dd className="mt-1 font-semibold text-[var(--ink)]">{course._count.items}</dd>
                      </div>
                      <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
                        <dt className="text-[var(--ink-muted)]">Записано учеников</dt>
                        <dd className="mt-1 font-semibold text-[var(--ink)]">{course.enrolledLearnersCount}</dd>
                      </div>
                    </dl>

                    <div className="mt-5 text-xs text-[var(--ink-muted)]">
                      Создан: {formatAdminDate(course.createdAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  }

  if (isHrDashboard && !shouldUseLearnerCoursesView) {
    const rawCourses = await prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        ...(q
          ? {
              title: { contains: q },
            }
          : {}),
        ...(hrCategory ? { category: hrCategory } : {}),
        ...(hrDifficulty ? { difficultyLevel: hrDifficulty } : {}),
      },
      orderBy: { title: "asc" },
      include: {
        owner: {
          select: {
            name: true,
            login: true,
          },
        },
        directAssignments: {
          select: { userId: true, expiresAt: true },
        },
        groupAssignments: {
          select: {
            expiresAt: true,
            group: {
              select: {
                memberships: {
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });

    const courses = rawCourses.map((course) => ({
      ...course,
      enrolledLearnersCount: getUniqueEnrolledLearnersCount(course),
    }));
    const assignedLearnersCount = courses.reduce((sum, course) => sum + course.enrolledLearnersCount, 0);
    const categoriesUsedCount = new Set(courses.map((course) => course.category).filter(Boolean)).size;

    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Курсы для назначения</h1>
            <p className="text-sm text-[var(--ink-muted)]">
              Показаны только опубликованные курсы. Здесь HR может быстро отфильтровать каталог и перейти к списку учеников курса.
            </p>
          </div>

          <div className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--ink-muted)]">
            {courses.length ? `Курсов в выдаче: ${courses.length}` : "Нет опубликованных курсов"}
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <HrMetricCard label="Опубликованных курсов" value={String(courses.length)} />
          <HrMetricCard label="Записано учеников" value={String(assignedLearnersCount)} />
          <HrMetricCard label="Категорий в выдаче" value={String(categoriesUsedCount)} />
        </section>

        <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm sm:p-5">
          <form action="/courses" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto_auto] lg:items-end">
            <label>
              <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Поиск по названию</span>
              <input
                id="hr-course-search"
                name="q"
                defaultValue={q}
                placeholder="Например, бюджетирование"
                className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Категория курса</span>
              <select
                name="category"
                defaultValue={hrCategory ?? ""}
                className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
              >
                <option value="">Все категории</option>
                {COURSE_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Уровень сложности</span>
              <select
                name="difficulty"
                defaultValue={hrDifficulty ?? ""}
                className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
              >
                <option value="">Любой уровень</option>
                {COURSE_DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              Применить
            </button>

            <Link
              href="/courses"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--line)] px-4 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              Сбросить
            </Link>
          </form>
        </section>

        <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Опубликованные курсы</h2>
            <p className="text-sm text-[var(--ink-muted)]">
              {courses.length ? `${courses.length} подходят под текущие фильтры` : q ? "Поиск не дал результатов" : "Список пока пуст"}
            </p>
          </div>

          {courses.length === 0 ? (
            <EmptySearch q={q} />
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--line)]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Курс</th>
                      <th className="px-4 py-3 text-left font-medium">Автор</th>
                      <th className="px-4 py-3 text-left font-medium">Категория</th>
                      <th className="px-4 py-3 text-left font-medium">Сложность</th>
                      <th className="px-4 py-3 text-left font-medium">Длительность</th>
                      <th className="px-4 py-3 text-left font-medium">Записано учеников</th>
                      <th className="px-4 py-3 text-right font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course) => (
                      <tr key={course.id} className="border-t border-[var(--line)] align-top text-[var(--ink)] hover:bg-[var(--accent-soft)]">
                        <td className="px-4 py-4">
                          <Link
                            href={`/courses/${course.id}/learners`}
                            className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                          >
                            {course.title}
                          </Link>
                          <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-muted)]">
                            {course.description || "Описание пока не добавлено"}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-[var(--ink)]">{course.owner?.name ?? "Не назначен"}</div>
                        </td>
                        <td className="px-4 py-4">{getCourseCategoryLabel(course.category)}</td>
                        <td className="px-4 py-4">{getCourseDifficultyLabel(course.difficultyLevel)}</td>
                        <td className="px-4 py-4">{formatCourseDuration(course.durationMinutes)}</td>
                        <td className="px-4 py-4">
                          <span className="font-medium text-[var(--ink)]">{course.enrolledLearnersCount}</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link
                              href={buildCourseReportExportHref(course.id, "csv")}
                              className="inline-flex rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                            >
                              Отчет CSV
                            </Link>
                            <Link
                              href={buildCourseReportExportHref(course.id, "xlsx")}
                              className="inline-flex rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                            >
                              Отчет Excel
                            </Link>
                            <Link
                              href={`/courses/${course.id}/learners`}
                              className="inline-flex rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                            >
                              Ученики
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  const assignedCourses = await prisma.course.findMany({
    where: {
      status: "PUBLISHED",
      AND: [learnerCourseAssignmentWhere(session.user.id)],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      directAssignments: {
        where: { userId: session.user.id },
        select: { assignedAt: true, assignedById: true, expiresAt: true },
      },
      groupAssignments: {
        select: {
          assignedAt: true,
          assignedById: true,
          expiresAt: true,
          group: {
            select: {
              memberships: {
                where: { userId: session.user.id },
                select: { userId: true },
              },
            },
          },
        },
      },
      learnerStates: {
        where: { userId: session.user.id },
        select: { lastOpenedCourseItemId: true, updatedAt: true },
        take: 1,
      },
      items: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        include: {
          views: {
            where: { userId: session.user.id },
            select: { progressPercent: true, viewedAt: true },
            take: 1,
          },
          quiz: {
            include: {
              questions: {
                where: { archivedAt: null },
                select: { id: true },
              },
              attempts: {
                where: { userId: session.user.id },
                orderBy: { attemptNumber: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const rawCatalogCourses =
    learnerTab === "catalog"
      ? await prisma.course.findMany({
          where: {
            status: "PUBLISHED",
            ...(q
              ? {
                  OR: [{ title: { contains: q } }, { description: { contains: q } }],
                }
              : {}),
            ...(hrCategory ? { category: hrCategory } : {}),
            ...(hrDifficulty ? { difficultyLevel: hrDifficulty } : {}),
          },
          orderBy: [{ publishedAt: "desc" }, { title: "asc" }],
          include: {
            owner: {
              select: {
                name: true,
                login: true,
              },
            },
            feedbacks: {
              where: { status: "PUBLISHED" },
              select: {
                rating: true,
              },
            },
          },
        })
      : [];

  const now = new Date();
  const learnerCourses: LearnerCourseListItem[] = assignedCourses.map((course) => {
    const publishedSnapshot = isPublishedSnapshotActive(course)
      ? parsePublishedCourseSnapshot(course.publishedSnapshotJson)
      : null;
    const displayItems = publishedSnapshot?.items ?? course.items;
    const displayTitle = publishedSnapshot?.title ?? course.title;
    const displayDescription = publishedSnapshot?.description ?? course.description;
    const displayCategory = publishedSnapshot?.category ?? course.category;
    const displayDifficulty = publishedSnapshot?.difficultyLevel ?? course.difficultyLevel;
    const displayQuizGateMode: CourseQuizGateMode =
      (publishedSnapshot?.quizGateMode ?? course.quizGateMode) === "PASSED" ? "PASSED" : "RESOLVED";
    const displayNavigationMode: CourseNavigationMode =
      (publishedSnapshot?.navigationMode ?? course.navigationMode) === "SEQUENTIAL" ? "SEQUENTIAL" : "FREE";
    const displayItemsWithLearnerData = displayItems.map((item) => {
      const liveItem = course.items.find((candidate) => candidate.id === item.id) ?? null;

      return {
        ...item,
        views: liveItem?.views ?? [],
        quiz: item.type === "QUIZ"
          ? {
              id: item.quiz?.id ?? liveItem?.quiz?.id ?? "",
              description: item.quiz?.description ?? liveItem?.quiz?.description ?? null,
              attempts: liveItem?.quiz?.attempts ?? [],
              questions: item.quiz?.questions ?? liveItem?.quiz?.questions ?? [],
              maxAttempts: item.quiz?.maxAttempts ?? liveItem?.quiz?.maxAttempts ?? 1,
              minCorrectAnswers: item.quiz?.minCorrectAnswers ?? liveItem?.quiz?.minCorrectAnswers ?? 1,
              lockMaterialsOnStart: item.quiz?.lockMaterialsOnStart ?? liveItem?.quiz?.lockMaterialsOnStart ?? false,
            }
          : null,
        viewed: liveItem?.views.length ? true : false,
        materialProgress: liveItem?.views[0]?.progressPercent ?? 0,
      };
    });
    const progress = getCourseProgress({
      courseTitle: displayTitle,
      courseDescription: displayDescription,
      quizGateMode: displayQuizGateMode,
      items: displayItemsWithLearnerData.map((item) => ({
        ...item,
        viewed: item.type === "QUIZ" ? false : item.viewed,
      })),
    });
    const hasViews = course.items.some((item) => item.views.length > 0);
    const inheritedAssignments = course.groupAssignments.filter(
      (assignment) => assignment.group.memberships.length > 0
    );
    const accessWindow = resolveEffectiveCourseAccessWindow(
      course.directAssignments.map((assignment) => assignment.expiresAt),
      inheritedAssignments.map((assignment) => assignment.expiresAt),
      now
    );
    const assignmentMeta = getLearnerAssignmentSortMeta(
      course.directAssignments,
      inheritedAssignments,
      accessWindow
    );
    const outline = buildCourseOutline(displayItemsWithLearnerData, displayNavigationMode, {
      lockQuizzesUntilPreviousRequiredComplete: canTakeKnowledgeCheck,
      lockMaterialsWhenQuizStarted: canTakeKnowledgeCheck,
      quizGateMode: displayQuizGateMode,
    });
    const resumeEntry = pickLearnerResumeEntry(
      outline,
      course.learnerStates[0]?.lastOpenedCourseItemId ?? null
    );

    return {
      id: course.id,
      title: displayTitle,
      description: displayDescription,
      coverUrl: publishedSnapshot?.coverUrl ?? course.coverUrl,
      progress,
      hasViews,
      state: getLearnerCourseState(progress),
      accessWindow,
      canOpenCourse: accessWindow?.isActive ?? false,
      assignedAt: assignmentMeta.assignedAt,
      deadlineAt: assignmentMeta.deadlineAt,
      lastActivityAt: getLearnerCourseLastActivityAt(
        course.learnerStates[0]?.updatedAt ?? null,
        course.items
      ),
      isInstructorAssigned: assignmentMeta.hasInstructorAssignment,
      hasInstructorDeadline: assignmentMeta.hasInstructorDeadline,
      isSelfSelectedFromCatalog: assignmentMeta.isSelfSelectedFromCatalog,
      aboutHref: buildLearnerCourseAboutHref(course.id),
      detailsHref: buildLearnerCourseDetailsHref(course.id, shouldUseLearnerCoursesView),
      resumeHref: buildLearnerCourseResumeHref(course.id, resumeEntry, shouldUseLearnerCoursesView),
      searchText: buildLearnerCourseSearchText({
        title: displayTitle,
        description: displayDescription,
        category: displayCategory,
        difficultyLevel: displayDifficulty,
      }),
    };
  }).sort(compareLearnerCourses);

  const learnerSearchTerms = learnerTab === "catalog" ? [] : getLearnerSearchTerms(q);
  const isLearnerSearchActive = learnerSearchTerms.length > 0;
  const searchedLearnerCourses = isLearnerSearchActive
    ? learnerCourses.filter((course) => matchesLearnerCourseSearch(course, learnerSearchTerms))
    : learnerCourses;
  const assignedCount = learnerCourses.length;
  const completedCount = learnerCourses.filter((course) => course.state === "completed").length;
  const assignedInProgressCount = assignedCount - completedCount;
  const defaultContinueCourse = learnerCourses.find(
    (course) => course.canOpenCourse && course.state !== "completed"
  ) ?? null;
  const continueCourse = isLearnerSearchActive
    ? searchedLearnerCourses.find((course) => course.canOpenCourse && course.state !== "completed") ?? null
    : defaultContinueCourse;
  const visibleAssignedCourses =
    learnerTab === "completed"
      ? searchedLearnerCourses.filter((course) => course.state === "completed")
      : isLearnerSearchActive
      ? searchedLearnerCourses.filter((course) => course.id !== continueCourse?.id)
      : learnerCourses.filter((course) => course.state !== "completed" && course.id !== continueCourse?.id);
  const learnerStatesByCourseId = new Map<string, ReturnType<typeof getLearnerCourseState>>(
    learnerCourses.map((course) => [course.id, course.state] as const)
  );
  const learnerAccessByCourseId = new Map<string, CourseAccessWindow | null>(
    learnerCourses.map((course) => [course.id, course.accessWindow] as const)
  );
  const assignedCourseIds = new Set(learnerCourses.map((course) => course.id));
  const catalogCourses = rawCatalogCourses
    .filter((course) => !assignedCourseIds.has(course.id))
    .map((course) => {
      const publishedSnapshot = isPublishedSnapshotActive(course)
        ? parsePublishedCourseSnapshot(course.publishedSnapshotJson)
        : null;
      const averageRating = getCourseAverageRating(course.feedbacks);
      const displayTitle = publishedSnapshot?.title ?? course.title;
      const displayDescription = publishedSnapshot?.description ?? course.description;
      const displayDurationMinutes = publishedSnapshot?.durationMinutes ?? course.durationMinutes;
      const displayCategory = publishedSnapshot?.category ?? course.category;
      const displayDifficulty = publishedSnapshot?.difficultyLevel ?? course.difficultyLevel;

      return {
        id: course.id,
        title: displayTitle,
        description: displayDescription,
        coverUrl: publishedSnapshot?.coverUrl ?? course.coverUrl,
        durationMinutes: displayDurationMinutes,
        durationLabel: formatCourseDuration(displayDurationMinutes),
        authorName: course.owner?.name ?? course.owner?.login ?? "Не назначен",
        categoryLabel: getCourseCategoryLabel(displayCategory),
        difficultyLabel: getCourseDifficultyLabel(displayDifficulty),
        averageRating: platformSettings.feedbackEnabled ? averageRating : null,
        reviewsCount: platformSettings.feedbackEnabled ? course.feedbacks.length : 0,
        isAssigned: assignedCourseIds.has(course.id),
        learnerState: learnerStatesByCourseId.get(course.id) ?? null,
        accessWindow: learnerAccessByCourseId.get(course.id) ?? null,
      };
    })
    .filter(
      (course) =>
        matchesLearnerCatalogDuration(course.durationMinutes, learnerDuration) &&
        (!platformSettings.feedbackEnabled || matchesLearnerCatalogRating(course.averageRating, learnerRating))
    );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm">
        <div className="border-b border-[var(--line)] bg-[var(--surface)] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                {learnerTab === "catalog" ? "Каталог курсов" : "Мои курсы"}
              </h1>
            </div>
          </div>
        </div>

        <div className="border-b border-[var(--line)] bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            {learnerTab === "catalog" ? (
              <div />
            ) : (
              <nav className="flex flex-wrap gap-2" aria-label="Разделы курсов">
                <LearnerTabLink
                  href={buildLearnerCoursesHref({ tab: "assigned", q, forceLearnerMode: shouldUseLearnerCoursesView })}
                  active={learnerTab === "assigned"}
                  label={`Назначенные (${assignedInProgressCount})`}
                />
                <LearnerTabLink
                  href={buildLearnerCoursesHref({ tab: "completed", q, forceLearnerMode: shouldUseLearnerCoursesView })}
                  active={learnerTab === "completed"}
                  label={`Завершенные (${completedCount})`}
                />
              </nav>
            )}

            {learnerTab === "catalog" ? (
              <p className="text-sm text-[var(--ink-muted)]">
                {catalogCourses.length ? `${catalogCourses.length} курсов в текущей выдаче` : "Каталог пока пуст"}
              </p>
            ) : (
              <LearnerCourseSearch value={q} tab={learnerTab} forceLearnerMode={shouldUseLearnerCoursesView} />
            )}
          </div>

          {isLearnerSearchActive && (
            <div className="mt-4 flex flex-col gap-1 rounded-lg bg-[var(--surface)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-[var(--ink)]">Найдено курсов: {searchedLearnerCourses.length}</p>
              <p className="text-[var(--ink-muted)]">Поиск учитывает название, описание, категорию и уровень курса.</p>
            </div>
          )}

          {learnerTab === "catalog" && (
            <form
              action="/courses"
              className={`mt-4 grid gap-3 lg:items-end ${
                platformSettings.feedbackEnabled
                  ? "lg:grid-cols-[minmax(0,1.2fr)_180px_180px_180px_180px_auto_auto]"
                  : "lg:grid-cols-[minmax(0,1.2fr)_220px_220px_220px_auto_auto]"
              }`}
            >
              <input type="hidden" name="tab" value="catalog" />

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Поиск курса</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Название или описание"
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Категория</span>
                <select
                  name="category"
                  defaultValue={hrCategory ?? ""}
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                >
                  <option value="">Все категории</option>
                  {COURSE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Уровень</span>
                <select
                  name="difficulty"
                  defaultValue={hrDifficulty ?? ""}
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                >
                  <option value="">Любой уровень</option>
                  {COURSE_DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Длительность</span>
                <select
                  name="duration"
                  defaultValue={learnerDuration}
                  className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                >
                  <option value="all">Любая</option>
                  <option value="short">До 1 часа</option>
                  <option value="medium">1-3 часа</option>
                  <option value="long">Более 3 часов</option>
                </select>
              </label>

              {platformSettings.feedbackEnabled ? (
                <label>
                  <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Рейтинг</span>
                  <select
                    name="rating"
                    defaultValue={learnerRating}
                    className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                  >
                    <option value="all">Любой</option>
                    <option value="4plus">От 4.0</option>
                    <option value="3plus">От 3.0</option>
                  </select>
                </label>
              ) : null}

              <button
                type="submit"
                className="h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                Применить
              </button>

              <Link
                href={buildLearnerCoursesHref({ tab: "catalog", forceLearnerMode: shouldUseLearnerCoursesView })}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--line)] px-4 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                Сбросить
              </Link>
            </form>
          )}
        </div>

        {learnerTab === "assigned" && (!isLearnerSearchActive || continueCourse) && (
          <div className="border-b border-[var(--line)] bg-[var(--surface)] py-4">
            <ContinueLearningPanel
              course={continueCourse}
              hasAssignedCourses={isLearnerSearchActive ? searchedLearnerCourses.length > 0 : assignedCount > 0}
              forceLearnerMode={shouldUseLearnerCoursesView}
            />
          </div>
        )}
      </section>

      <section>
        {learnerTab === "catalog" ? (
          catalogCourses.length === 0 ? (
            <LearnerEmptyState message="Нет курсов под текущие фильтры. Попробуйте сбросить часть ограничений." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {catalogCourses.map((course) => (
                <li key={course.id}>
                  <Link
                    href={`/courses/${course.id}/about?from=catalog`}
                    className="group block h-full overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm transition hover:border-[var(--line)] hover:shadow"
                  >
                    <LearnerCourseCover
                      coverUrl={course.coverUrl}
                      title={course.title}
                      meta={course.categoryLabel}
                    />

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1">{course.difficultyLabel}</span>
                            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1">{course.durationLabel}</span>
                          </div>
                          <h2 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-[var(--ink)]">
                            {course.title}
                          </h2>
                        </div>

                        {platformSettings.feedbackEnabled ? (
                          <LearnerRatingBadge rating={course.averageRating} reviewsCount={course.reviewsCount} />
                        ) : null}
                      </div>

                      <p className="mt-3 line-clamp-3 min-h-[60px] text-sm leading-5 text-[var(--ink-muted)]">
                        {course.description || "Краткое описание курса пока не заполнено."}
                      </p>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                        <div className="min-w-0">
                          <div className="text-xs text-[var(--ink-muted)]">Автор</div>
                          <div className="truncate text-sm font-medium text-[var(--ink)]">{course.authorName}</div>
                        </div>
                        <LearnerAccessBadge
                          assigned={course.isAssigned}
                          state={course.learnerState}
                          accessWindow={course.accessWindow}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          visibleAssignedCourses.length === 0 ? (
            <LearnerEmptyState
              message={
                isLearnerSearchActive
                  ? continueCourse
                    ? `По запросу «${q}» найден курс в блоке «Продолжить обучение».`
                    : `По запросу «${q}» ничего не найдено.`
                  : learnerTab === "completed"
                    ? "Завершенных курсов пока нет."
                    : continueCourse
                      ? "Других назначенных курсов пока нет."
                      : "Назначенных курсов пока нет."
              }
            />
          ) : (
            <ul className="space-y-4">
              {visibleAssignedCourses.map((course) => (
                <LearnerAssignedCourseCard key={course.id} course={course} />
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  );
}

function EmptySearch({ q }: { q: string }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-black bg-white p-8 text-center">
      <p className="text-sm text-[var(--ink)]">
        {q ? `По запросу «${q}» ничего не найдено.` : "Список курсов пока пуст."}
      </p>
    </div>
  );
}

function LearnerAssignedCourseCard({ course }: { course: LearnerCourseListItem }) {
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

function LearnerCourseStatusPill({ label }: { label: string }) {
  return (
    <span className="text-sm font-medium text-[var(--ink)]">
      {label}
    </span>
  );
}

function LearnerCourseAction({
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

function ContinueLearningPanel({
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

function LearnerTabLink({
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

function LearnerCourseCover({
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

function LearnerRatingBadge({
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

function LearnerAccessBadge({
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

function LearnerDeadlineBadge({
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

function getLearnerDeadlineCardLabel(
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

function LearnerStateLabel({
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

function LearnerEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-white p-8 text-center shadow-sm">
      <p className="text-sm text-[var(--ink)]">{message}</p>
    </div>
  );
}

function getLearnerCourseActionLabel(course: LearnerCourseListItem) {
  if (!course.canOpenCourse) return "О курсе";
  if (course.state === "completed") return "Открыть курс";
  if (course.state === "not_started") return "Начать курс";
  return "Продолжить";
}

function getLearnerCourseListStatus(course: LearnerCourseListItem, isAccessExpired: boolean) {
  if (isAccessExpired) return "Просрочено";
  if (course.state === "completed") return "Завершен";
  if (course.state === "not_started") return "Не начат";
  return "В процессе";
}

function HrMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
      <div className="mt-1 text-sm text-[var(--ink-muted)]">{label}</div>
    </div>
  );
}

function AdminStatusTile({
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

function AdminCourseStatusBadge({ status }: { status: string }) {
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

function getAdminStatusParam(value?: string) {
  if (value === "all" || value === "draft" || value === "published" || value === "archived") return value;
  return "all";
}

function getAdminViewParam(value?: string): AdminCourseView {
  if (value === "cards" || value === "list") return value;
  return "table";
}

function buildAdminCoursesHref({
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

function buildCourseReportExportHref(courseId: string, format: "csv" | "xlsx") {
  const params = new URLSearchParams();
  if (format !== "csv") params.set("format", format);
  const query = params.toString();
  return query ? `/courses/${courseId}/results/export?${query}` : `/courses/${courseId}/results/export`;
}

function buildAdminCourseCardHref(courseId: string) {
  return `/courses/${courseId}/manage?section=structure`;
}

function getLearnerSearchTerms(value: string) {
  return normalizeLearnerSearchText(value)
    .split(/\s+/)
    .filter(Boolean);
}

function matchesLearnerCourseSearch(course: LearnerCourseListItem, terms: string[]) {
  return terms.every((term) => course.searchText.includes(term));
}

function buildLearnerCourseSearchText({
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

function normalizeLearnerSearchText(value: string) {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim();
}

function compareLearnerCourses(left: LearnerCourseListItem, right: LearnerCourseListItem) {
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

function getLearnerCourseSortGroup(course: LearnerCourseListItem) {
  if (course.canOpenCourse && course.state !== "completed" && course.lastActivityAt) return 0;
  if (course.canOpenCourse && course.state !== "completed" && course.hasInstructorDeadline) return 1;
  if (course.canOpenCourse && course.state !== "completed" && course.isSelfSelectedFromCatalog) return 2;
  if (course.canOpenCourse && course.state !== "completed") return 3;
  if (course.state === "completed") return 4;
  return 5;
}

function getLearnerAssignmentSortMeta(
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

function getLearnerCourseLastActivityAt(
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

function getEarliestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((earliest, value) => {
    if (!value) return earliest;
    if (!earliest || value.getTime() < earliest.getTime()) return value;
    return earliest;
  }, null);
}

function getLatestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    if (!latest || value.getTime() > latest.getTime()) return value;
    return latest;
  }, null);
}

function compareOptionalDateAsc(left: Date | null, right: Date | null) {
  if (left && right) return left.getTime() - right.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function compareOptionalDateDesc(left: Date | null, right: Date | null) {
  if (left && right) return right.getTime() - left.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function learnerCourseAssignmentWhere(userId: string) {
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

function getHrCategoryParam(value?: string) {
  if (value && isCourseCategory(value)) return value;
  return undefined;
}

function getHrDifficultyParam(value?: string) {
  if (value && isCourseDifficultyLevel(value)) return value;
  return undefined;
}

function getLearnerTabParam(value?: string) {
  if (value === "catalog" || value === "assigned" || value === "completed") return value;
  return undefined;
}

function getLearnerCatalogDurationParam(value?: string) {
  if (value === "short" || value === "medium" || value === "long") return value;
  return "all";
}

function getLearnerCatalogRatingParam(value?: string) {
  if (value === "4plus" || value === "3plus") return value;
  return "all";
}

function buildLearnerCoursesHref({
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

function pickLearnerResumeEntry(outline: CourseOutlineEntry[], lastOpenedItemId: string | null) {
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

function buildLearnerCourseDetailsHref(courseId: string, forceContentView = false) {
  if (!forceContentView) return `/courses/${courseId}`;

  const params = new URLSearchParams({ view: "content", from: "assigned" });
  return `/courses/${courseId}?${params.toString()}`;
}

function buildLearnerCourseAboutHref(courseId: string) {
  return `/courses/${courseId}/about`;
}

function buildLearnerCourseResumeHref(
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

function getCourseAverageRating(feedbacks: Array<{ rating: number }>) {
  if (feedbacks.length === 0) return null;
  return Number((feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0) / feedbacks.length).toFixed(1));
}

function matchesLearnerCatalogDuration(
  durationMinutes: number | null | undefined,
  filter: ReturnType<typeof getLearnerCatalogDurationParam>
) {
  if (filter === "all") return true;
  if (!durationMinutes || durationMinutes < 1) return false;
  if (filter === "short") return durationMinutes <= 60;
  if (filter === "medium") return durationMinutes > 60 && durationMinutes <= 180;
  return durationMinutes > 180;
}

function matchesLearnerCatalogRating(
  averageRating: number | null,
  filter: ReturnType<typeof getLearnerCatalogRatingParam>
) {
  if (filter === "all") return true;
  if (averageRating === null) return false;
  if (filter === "4plus") return averageRating >= 4;
  return averageRating >= 3;
}

function getLearnerCatalogAssignmentLabel(
  state: LearnerCourseState | null
) {
  if (state === "completed") return "Курс завершен";
  if (state === "in_progress") return "Можно продолжить";
  return "Уже назначен";
}

function formatAdminDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function getLearnerCourseState(progress: ReturnType<typeof getCourseProgress>): LearnerCourseState {
  if (progress.requiredTotal > 0 && progress.completedRequired >= progress.requiredTotal) return "completed";
  if (progress.percent > 0) return "in_progress";
  return "not_started";
}
