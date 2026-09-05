import Link from "next/link";
import { Select } from "@/components/ui";
import type {
  HrCourseAnalyticsStatusFilter,
  HrCourseSummaryRow,
} from "@/lib/hr-course-analytics";
import type {
  AdminOverviewData,
  CourseAnalyticsRow,
  HrFeedbackFeedItem,
  UserStatsData,
} from "./types";
import { buildHrAnalyticsHref, buildHrCourseLearnersHref } from "./hrefs";

// Презентационные секции страницы аналитики. Вынесены из page.tsx
// без изменения разметки/поведения (серверные компоненты без состояния).

export function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-white text-[var(--ink)] shadow-[inset_0_-3px_0_var(--ink)]"
          : "border border-transparent bg-white text-[var(--ink-muted)] hover:border-[var(--line)] hover:bg-[var(--surface-raised)]"
      }`}
    >
      {label}
    </Link>
  );
}

export function AdminOverviewSection({ data }: { data: AdminOverviewData }) {
  return (
    <section className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Курсов всего" value={String(data.coursesCount)} />
        <MetricCard label="Пользователей" value={String(data.usersCount)} />
        <MetricCard label="Назначений" value={String(data.assignmentsCount)} />
        <MetricCard label="Попыток тестов" value={String(data.attemptsCount)} />
        <MetricCard label="Средний результат" value={`${data.avgResultPercent}%`} />
        <MetricCard label="Средняя оценка обратной связи" value={data.avgFeedback ? data.avgFeedback.toFixed(1) : "—"} />
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Последние прохождения</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-[var(--ink)]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]">
                <th className="px-2 py-2 font-medium">Пользователь</th>
                <th className="px-2 py-2 font-medium">Курс</th>
                <th className="px-2 py-2 font-medium">Тест</th>
                <th className="px-2 py-2 font-medium">Результат</th>
                <th className="px-2 py-2 font-medium">Статус</th>
                <th className="px-2 py-2 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody>
              {data.latestAttempts.map((item) => (
                <tr key={item.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-2 py-2">{item.user}</td>
                  <td className="px-2 py-2">{item.course}</td>
                  <td className="px-2 py-2">{item.quiz}</td>
                  <td className="px-2 py-2">{item.scorePercent}%</td>
                  <td className="px-2 py-2">{item.status}</td>
                  <td className="px-2 py-2">{item.completedAt.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Проблемные курсы</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-[var(--ink)]">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]">
                  <th className="px-2 py-2 font-medium">Курс</th>
                  <th className="px-2 py-2 font-medium">Средний результат</th>
                  <th className="px-2 py-2 font-medium">Средняя оценка</th>
                  <th className="px-2 py-2 font-medium">Неуспешные</th>
                </tr>
              </thead>
              <tbody>
                {data.problemCourses.map((course) => (
                  <tr key={course.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-2 py-2">{course.title}</td>
                    <td className="px-2 py-2">{course.avgResultPercent}%</td>
                    <td className="px-2 py-2">{course.avgRating === null ? "—" : course.avgRating}</td>
                    <td className="px-2 py-2">{course.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Последние отзывы</h2>
          <ul className="mt-4 space-y-3">
            {data.latestFeedback.map((feedback) => (
              <li key={feedback.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{feedback.user}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{feedback.course}</p>
                  </div>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent)]">
                    {feedback.rating}/5
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--ink)]">{feedback.comment || "Комментарий не указан"}</p>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">{feedback.createdAt.toLocaleString("ru-RU")}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function AdminCoursesSection({ rows }: { rows: CourseAnalyticsRow[] }) {
  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
      <h2 className="text-lg font-semibold text-[var(--ink)]">По курсам</h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">Сводная таблица по каждому курсу и уровню активности.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-[var(--ink)]">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]">
              <th className="px-2 py-2 font-medium">Название курса</th>
              <th className="px-2 py-2 font-medium">Группа/направление</th>
              <th className="px-2 py-2 font-medium">Средний результат</th>
              <th className="px-2 py-2 font-medium">Прохождений</th>
              <th className="px-2 py-2 font-medium">Неуспешных</th>
              <th className="px-2 py-2 font-medium">Средняя оценка</th>
              <th className="px-2 py-2 font-medium">Статус активности</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-2 py-2">{row.title}</td>
                <td className="px-2 py-2">{row.groupName}</td>
                <td className="px-2 py-2">{row.avgResultPercent}%</td>
                <td className="px-2 py-2">{row.attemptsCount}</td>
                <td className="px-2 py-2">{row.failedCount}</td>
                <td className="px-2 py-2">{row.avgRating === null ? "—" : row.avgRating}</td>
                <td className="px-2 py-2">{row.activityStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HrCoursesSection({
  rows,
  summary,
  monthlyCompletions,
  feedbackFeed,
  q,
  statusFilter,
}: {
  rows: HrCourseSummaryRow[];
  summary: {
    totalCourses: number;
    publishedCourses: number;
    draftCourses: number;
    coursesWithAssignments: number;
    assignedLearners: number;
    expiredAccessLearners: number;
    completedLearners: number;
    pendingInvites: number;
    avgProgressPercent: number;
    avgGradePercent: number | null;
  };
  monthlyCompletions: Array<{
    monthKey: string;
    label: string;
    count: number;
  }>;
  feedbackFeed: HrFeedbackFeedItem[];
  q: string;
  statusFilter: HrCourseAnalyticsStatusFilter;
}) {
  return (
    <section className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-8">
        <MetricCard label="Курсов в отчете" value={String(summary.totalCourses)} />
        <MetricCard label="Опубликованы" value={String(summary.publishedCourses)} />
        <MetricCard label="С назначениями" value={String(summary.coursesWithAssignments)} />
        <MetricCard label="Всего записано" value={String(summary.assignedLearners)} />
        <MetricCard label="Истек доступ" value={String(summary.expiredAccessLearners)} />
        <MetricCard label="Завершили" value={String(summary.completedLearners)} />
        <MetricCard label="Средний прогресс" value={`${summary.avgProgressPercent}%`} />
        <MetricCard
          label="Средняя оценка"
          value={summary.avgGradePercent === null ? "—" : `${formatPercent(summary.avgGradePercent)}%`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Завершения по месяцам</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                График строится по текущей выборке курсов и показывает, сколько завершений произошло в каждом месяце.
              </p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              Последние месяцы
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {monthlyCompletions.map((bucket) => {
              const maxCount = Math.max(...monthlyCompletions.map((item) => item.count), 1);
              const heightPercent = Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 18 : 6);

              return (
                <div
                  key={bucket.monthKey}
                  aria-label={`Завершения ${bucket.label}: ${bucket.count}`}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                      {bucket.label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--ink)]">{bucket.count}</span>
                  </div>
                  <div className="mt-4 flex h-28 items-end rounded-xl bg-[var(--surface)] px-4 py-3">
                    <div
                      className="w-full rounded-t-xl bg-[var(--accent)] transition-all"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Состояние выборки</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Быстрый срез по текущему набору курсов: прогресс, завершения и результаты тестов.
          </p>

          <dl className="mt-5 space-y-4">
            <StatsLine label="Курсов в отчете" value={String(summary.totalCourses)} />
            <StatsLine label="Всего записано" value={String(summary.assignedLearners)} />
            <StatsLine
              label="Завершили"
              value={
                summary.assignedLearners > 0
                  ? `${summary.completedLearners} (${formatPercent(
                      (summary.completedLearners / summary.assignedLearners) * 100
                    )}%)`
                  : "0"
              }
            />
            <StatsLine label="Средний прогресс" value={`${formatPercent(summary.avgProgressPercent)}%`} />
            <StatsLine
              label="Средняя оценка"
              value={summary.avgGradePercent === null ? "—" : `${formatPercent(summary.avgGradePercent)}%`}
            />
            <StatsLine label="Инвайты в ожидании" value={String(summary.pendingInvites)} />
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Лента отзывов</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Последние опубликованные отзывы по курсам из текущей выборки.
            </p>
          </div>
          <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
            {feedbackFeed.length ? `${feedbackFeed.length} последних` : "Пока пусто"}
          </span>
        </div>

        {feedbackFeed.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
            По выбранным курсам еще нет опубликованных отзывов.
          </div>
        ) : (
          <ul className="mt-5 grid gap-3 lg:grid-cols-2">
            {feedbackFeed.map((feedback) => (
              <li key={feedback.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{feedback.learnerName}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">
                      {feedback.courseTitle} · {feedback.learnerLogin}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--warning)]">
                    {feedback.rating}/5
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-5 text-[var(--ink)]">
                  {feedback.comment || "Комментарий не указан."}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                  <span>{feedback.createdAt.toLocaleString("ru-RU")}</span>
                  <Link
                    href={`/courses/${feedback.courseId}/learners`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    К курсу
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Сводка по курсам</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              По каждому курсу видно, сколько учеников с активным доступом, сколько завершили обучение, каков средний прогресс и как проходят тесты.
            </p>
          </div>
          <div className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
            Инвайтов в ожидании: {summary.pendingInvites}
          </div>
        </div>

        <form action="/analytics" className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <input type="hidden" name="tab" value="courses" />
          <label>
            <span className="mb-1 block text-xs text-[var(--ink-muted)]">Поиск по курсу</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Название или описание курса"
              className="h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs text-[var(--ink-muted)]">Статус</span>
            <Select
              name="status"
              defaultValue={statusFilter}
              className="w-full"
            >
              <option value="all">Все курсы</option>
              <option value="published">Только опубликованные</option>
              <option value="draft">Черновики</option>
            </Select>
          </label>

          <button
            type="submit"
            className="h-10 self-end rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Применить
          </button>

          <Link
            href={buildHrAnalyticsHref({})}
            className="inline-flex h-10 items-center justify-center self-end rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
          >
            Сбросить
          </Link>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-[var(--ink)]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]">
                <th className="px-2 py-2 font-medium">Курс</th>
                <th className="px-2 py-2 font-medium">Статус</th>
                <th className="px-2 py-2 font-medium">Группа/направление</th>
                <th className="px-2 py-2 font-medium">Записано</th>
                <th className="px-2 py-2 font-medium">Истек доступ</th>
                <th className="px-2 py-2 font-medium">Завершили</th>
                <th className="px-2 py-2 font-medium">В обучении</th>
                <th className="px-2 py-2 font-medium">Не начали</th>
                <th className="px-2 py-2 font-medium">Средний прогресс</th>
                <th className="px-2 py-2 font-medium">Средняя оценка</th>
                <th className="px-2 py-2 font-medium">Инвайты</th>
                <th className="px-2 py-2 font-medium">Обновлен</th>
                <th className="px-2 py-2 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, access: "active" })}
                      className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        row.status === "PUBLISHED"
                          ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : "bg-[var(--warning-soft)] text-[var(--warning)]"
                      }`}
                    >
                      {row.status === "PUBLISHED" ? "Опубликован" : "Черновик"}
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.groupName}</td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, access: "active" })}
                      className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                    >
                      {row.assignedLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, access: "expired" })}
                      className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                    >
                      {row.expiredAccessLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, status: "completed", access: "active" })}
                      className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                    >
                      {row.completedLearnersCount} ({formatPercent(row.completedLearnersPercent)}%)
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, status: "in_progress", access: "active" })}
                      className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                    >
                      {row.inProgressLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={buildHrCourseLearnersHref({ courseId: row.id, status: "not_started", access: "active" })}
                      className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                    >
                      {row.notStartedLearnersCount}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <div className="min-w-24">
                      <div className="flex items-center justify-between gap-2">
                        <span>{formatPercent(row.avgProgressPercent)}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-[var(--line)]">
                        <div
                          className="h-2 rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.max(0, Math.min(row.avgProgressPercent, 100))}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {row.avgGradePercent === null ? "—" : `${formatPercent(row.avgGradePercent)}%`}
                  </td>
                  <td className="px-2 py-2">{row.pendingInvitesCount}</td>
                  <td className="px-2 py-2">{row.updatedAt.toLocaleDateString("ru-RU")}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={buildHrCourseLearnersHref({ courseId: row.id, access: "active" })}
                        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
                      >
                        Ученики
                      </Link>
                      <Link
                        href={`/courses/${row.id}/results`}
                        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
                      >
                        Результаты
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-2 py-8 text-center text-[var(--ink-muted)]">
                    По выбранным фильтрам курсы не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function UserStatsSection({ data }: { data: UserStatsData }) {
  return (
    <section className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Назначено курсов" value={String(data.assignedCourses)} />
        <MetricCard label="Завершено" value={String(data.completedCourses)} />
        <MetricCard label="Средний результат" value={`${data.avgResultPercent}%`} />
        <MetricCard
          label="Последняя активность"
          value={data.lastActivity ? data.lastActivity.toLocaleDateString("ru-RU") : "Нет"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Последние попытки</h2>
          <ul className="mt-4 space-y-3">
            {data.latestAttempts.map((attempt) => (
              <li key={attempt.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{attempt.quiz}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{attempt.course}</p>
                  </div>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent)]">
                    {attempt.status}
                  </span>
                </div>
                <div className="mt-2 text-sm text-[var(--ink)]">Результат: {attempt.scorePercent}%</div>
                <div className="mt-1 text-xs text-[var(--ink-muted)]">{attempt.completedAt.toLocaleString("ru-RU")}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_8px_20px_rgba(18,40,70,0.05)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Текущий прогресс по курсам</h2>
          <ul className="mt-4 space-y-4">
            {data.courseProgress.map((course) => (
              <li key={course.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink)]">{course.title}</p>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {course.completedRequired}/{course.requiredTotal}
                  </span>
                </div>
                <div className="mt-2 text-xs text-[var(--ink-muted)]">Общий прогресс: {course.percent}%</div>
                <div className="mt-2 h-2 rounded-full bg-[var(--line)]">
                  <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${course.percent}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--ink-muted)]">
                  <div>Лекционный материал: {course.lecturePercent}%</div>
                  <div>Тест: {course.quizPercent}%</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_8px_18px_rgba(18,40,70,0.05)]">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
    </div>
  );
}

function StatsLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-[var(--ink-muted)]">{label}</dt>
      <dd className="text-sm font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
