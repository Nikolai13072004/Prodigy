import Link from "next/link";
import { getUniqueEnrolledLearnersCount } from "@/lib/course-enrollment";
import {
  COURSE_CATEGORY_OPTIONS,
  COURSE_DIFFICULTY_OPTIONS,
  formatCourseDuration,
  getCourseCategoryLabel,
  getCourseDifficultyLabel,
} from "@/lib/course-metadata";
import prisma from "@/lib/prisma";
import {
  EmptySearch,
  HrMetricCard,
  buildCourseReportExportHref,
} from "../_page-parts";

// Интерфейс HR: «Курсы для назначения» (ветка isHrDashboard).
// Вынесено из courses/page.tsx (ADR-013 IA-A).
export async function HrCoursesView({
  q,
  hrCategory,
  hrDifficulty,
}: {
  q: string;
  hrCategory: string | undefined;
  hrDifficulty: string | undefined;
}) {
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
