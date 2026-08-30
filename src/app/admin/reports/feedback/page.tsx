import Link from "next/link";
import { requirePermission } from "@/lib/auth-guards";
import {
  getFeedbackReportData,
  getFeedbackReportRatingParam,
  getFeedbackReportStatusParam,
  type FeedbackReportFilters,
  type FeedbackReportRating,
  type FeedbackReportStatus,
} from "@/lib/feedback-report";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";
import { Badge } from "@/components/ui";

const REPORT_PATH = "/admin/reports/feedback";
const EXPORT_PATH = "/admin/reports/feedback/export";

type Props = {
  searchParams: Promise<{
    q?: string;
    courseId?: string;
    status?: string;
    rating?: string;
    createdFrom?: string;
    createdTo?: string;
  }>;
};

export default async function FeedbackReportPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const sp = await searchParams;
  const status = getFeedbackReportStatusParam(sp.status);
  const rating = getFeedbackReportRatingParam(sp.rating);
  const filters: FeedbackReportFilters = {
    q: sp.q ?? "",
    courseId: sp.courseId ?? "",
    status,
    rating,
    createdFrom: sp.createdFrom ?? "",
    createdTo: sp.createdTo ?? "",
  };

  const [data, courses] = await Promise.all([
    getFeedbackReportData(filters),
    prisma.course.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);
  const maxDistribution = Math.max(...Object.values(data.summary.distribution), 1);

  return (
    <main className="mx-auto max-w-[1160px] text-[var(--ink)]">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/admin/reports"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-muted)] transition hover:bg-[var(--accent-soft)]"
        >
          ←
          <span className="sr-only">К разделу «Отчеты»</span>
        </Link>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-[38px]">Отчет по отзывам</h1>
          <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
            Оценки курсов, комментарии учеников, отзывы на модерации и экспорт для анализа качества обучения.
          </p>
        </div>
      </div>

      <form action={REPORT_PATH} className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[0_16px_32px_rgba(18,40,70,0.08)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_220px_160px_160px_160px_160px]">
          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Поиск</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Курс, сотрудник, логин, комментарий"
              className="h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] placeholder:text-[var(--ink-muted)] focus:ring-2"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Курс</span>
            <select
              name="courseId"
              defaultValue={filters.courseId}
              className="h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
            >
              <option value="">Все курсы</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>

          <ToolbarSelect label="Статус" name="status" defaultValue={status} options={STATUS_OPTIONS} />
          <ToolbarSelect label="Оценка" name="rating" defaultValue={rating} options={RATING_OPTIONS} />

          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">С даты</span>
            <input
              type="date"
              name="createdFrom"
              defaultValue={filters.createdFrom}
              className="h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">По дату</span>
            <input
              type="date"
              name="createdTo"
              defaultValue={filters.createdTo}
              className="h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 border-t border-[var(--line)] pt-5">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
          >
            Построить отчет
          </button>
          <Link
            href={buildExportHref(filters)}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
          >
            Экспорт XLSX
          </Link>
          <Link
            href={REPORT_PATH}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
          >
            Сбросить
          </Link>
        </div>
      </form>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Всего отзывов" value={String(data.summary.total)} />
        <MetricCard label="Средняя оценка" value={data.summary.averageRating === null ? "Нет" : `${data.summary.averageRating}/5`} />
        <MetricCard label="Опубликовано" value={String(data.summary.published)} />
        <MetricCard label="На модерации" value={String(data.summary.pending)} />
        <MetricCard label="С комментариями" value={String(data.summary.withComments)} />
        <MetricCard label="Низкие оценки" value={String(data.summary.lowRatings)} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[0_16px_32px_rgba(18,40,70,0.08)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Распределение оценок</h2>
          <div className="mt-4 space-y-3">
            {([5, 4, 3, 2, 1] as const).map((value) => (
              <div key={value} className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 text-sm">
                <span className="font-medium text-[var(--ink)]">{value} ★</span>
                <div className="h-2 rounded-full bg-[var(--surface)]">
                  <div
                    className="h-2 rounded-full bg-[var(--accent)]"
                    style={{ width: `${(data.summary.distribution[value] / maxDistribution) * 100}%` }}
                  />
                </div>
                <span className="text-right text-[var(--ink-muted)]">{data.summary.distribution[value]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[0_16px_32px_rgba(18,40,70,0.08)]">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Сводка по курсам</h2>
          {data.courseRows.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink-muted)]">По текущим фильтрам отзывов нет.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Курс</th>
                    <th className="px-4 py-3 text-left font-medium">Отзывы</th>
                    <th className="px-4 py-3 text-left font-medium">Средняя</th>
                    <th className="px-4 py-3 text-left font-medium">Низкие</th>
                    <th className="px-4 py-3 text-left font-medium">Последний</th>
                  </tr>
                </thead>
                <tbody>
                  {data.courseRows.map((row) => (
                    <tr key={row.courseId} className="border-t border-[var(--line)] text-[var(--ink)]">
                      <td className="px-4 py-3">{row.courseTitle}</td>
                      <td className="px-4 py-3">{row.feedbacksCount}</td>
                      <td className="px-4 py-3">{row.averageRating === null ? "Нет" : `${row.averageRating}/5`}</td>
                      <td className="px-4 py-3">{row.lowRatingCount}</td>
                      <td className="px-4 py-3">{row.lastFeedbackAt ? formatDate(row.lastFeedbackAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[0_16px_32px_rgba(18,40,70,0.08)]">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Детализация отзывов</h2>
        {data.rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-10 text-center text-sm text-[var(--ink-muted)]">
            По текущим фильтрам отзывов нет.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Дата</th>
                  <th className="px-4 py-3 text-left font-medium">Курс</th>
                  <th className="px-4 py-3 text-left font-medium">Сотрудник</th>
                  <th className="px-4 py-3 text-left font-medium">Оценка</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-left font-medium">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--line)] align-top text-[var(--ink)]">
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="min-w-[220px] px-4 py-3">{row.courseTitle}</td>
                    <td className="min-w-[180px] px-4 py-3">
                      <div>{row.learnerName}</div>
                      <div className="mt-1 text-xs text-[var(--ink-muted)]">{row.learnerLogin}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{row.rating}/5</td>
                    <td className="px-4 py-3"><FeedbackStatusBadge status={row.status} label={row.statusLabel} /></td>
                    <td className="min-w-[280px] px-4 py-3 text-[var(--ink-muted)]">{row.comment || "Комментарий не указан."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const STATUS_OPTIONS: Array<{ value: FeedbackReportStatus; label: string }> = [
  { value: "all", label: "Все" },
  { value: "published", label: "Опубликованные" },
  { value: "pending", label: "На модерации" },
];

const RATING_OPTIONS: Array<{ value: FeedbackReportRating; label: string }> = [
  { value: "all", label: "Все" },
  { value: "5", label: "5" },
  { value: "4", label: "4" },
  { value: "3", label: "3" },
  { value: "2", label: "2" },
  { value: "1", label: "1" },
  { value: "low", label: "1-3" },
];

function ToolbarSelect<TValue extends string>({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: TValue;
  options: Array<{ value: TValue; label: string }>;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[0_8px_20px_rgba(18,40,70,0.06)]">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}

function FeedbackStatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={status === "PENDING" ? "warning" : "success"}>{label}</Badge>;
}

function buildExportHref(filters: FeedbackReportFilters) {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.courseId) params.set("courseId", filters.courseId);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.rating && filters.rating !== "all") params.set("rating", filters.rating);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  params.set("format", "xlsx");
  return `${EXPORT_PATH}?${params.toString()}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
