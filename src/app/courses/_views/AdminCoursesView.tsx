import Link from "next/link";
import { AdminViewPreferenceLink } from "@/app/courses/AdminViewPreferenceLink";
import { getUniqueEnrolledLearnersCount } from "@/lib/course-enrollment";
import prisma from "@/lib/prisma";
import {
  AdminCourseStatusBadge,
  AdminStatusTile,
  EmptySearch,
  buildAdminCourseCardHref,
  buildAdminCoursesHref,
  formatAdminDate,
  getAdminViewParam,
} from "../_page-parts";

// Интерфейс администратора/автора курсов (ветка shouldShowAdminCourses).
// Вынесено из courses/page.tsx (god-component, ADR-013 IA-A).
export async function AdminCoursesView({
  q,
  adminStatus,
  adminViewParam,
  canCreateCourses,
}: {
  q: string;
  adminStatus: "all" | "draft" | "published" | "archived";
  adminViewParam?: string;
  canCreateCourses: boolean;
}) {
    const adminView = getAdminViewParam(adminViewParam);

    const rawCourses = await prisma.course.findMany({
      where: q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
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
