import Link from "next/link";
import { requirePermission } from "@/lib/auth-guards";
import {
  getLearnerReportSortParam,
  getLearnerReportStatusParam,
  getLearnerReportUserStatusParam,
  getLearnersReportData,
  type LearnerReportRow,
  type LearnerReportSort,
  type LearnerReportStatus,
  type LearnerReportUserStatus,
  type LearnersReportFilters,
} from "@/lib/learners-report";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

const LEARNER_PROGRESS_REPORT_PATH = "/admin/reports/learner-progress";
const LEARNER_PROGRESS_EXPORT_PATH = "/admin/reports/learner-progress/export";

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    userStatus?: string;
    courseId?: string;
    assignedRange?: string;
    groupId?: string;
    departmentId?: string;
    registeredFrom?: string;
    registeredTo?: string;
    notice?: string;
    error?: string;
  }>;
};

export default async function LearnerProgressReportPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const sp = await searchParams;
  const statusFilter = getLearnerReportStatusParam(sp.status);
  const sort = getLearnerReportSortParam(sp.sort);
  const userStatusFilter = getLearnerReportUserStatusParam(sp.userStatus);
  const reportFilters: LearnersReportFilters = {
    q: sp.q ?? "",
    statusFilter,
    sort,
    userStatusFilter,
    courseId: sp.courseId ?? "",
    assignedRange: sp.assignedRange ?? "",
    groupId: sp.groupId ?? "",
    departmentId: sp.departmentId ?? "",
    registeredFrom: sp.registeredFrom ?? "",
    registeredTo: sp.registeredTo ?? "",
  };
  const [data, groups, departments, courses] = await Promise.all([
    getLearnersReportData(reportFilters),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const metrics = summarizeLearnerProgress(data.filteredRows);
  const nextNameSort: LearnerReportSort = sort === "name_asc" ? "name_desc" : "name_asc";
  const nameSortIndicator = sort === "name_asc" ? "↑" : "↓";
  const hasAdvancedFilters = Boolean(
    (sp.q ?? "").trim() ||
      userStatusFilter !== "active" ||
      (sp.groupId ?? "").trim() ||
      (sp.departmentId ?? "").trim() ||
      (sp.registeredFrom ?? "").trim() ||
      (sp.registeredTo ?? "").trim()
  );

  return (
    <main className="mx-auto max-w-[1160px] text-[#203451]">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/admin/reports"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d6deea] bg-white text-[#61738e] shadow-[0_8px_20px_rgba(18,40,70,0.05)] transition hover:border-[#bfd6e6] hover:bg-[#f7fbfe] hover:text-[#203451]"
        >
          <ArrowLeftIcon />
          <span className="sr-only">К разделу «Отчеты»</span>
        </Link>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#203451] sm:text-[38px]">Прогресс учащихся</h1>
          <p className="mt-1.5 text-sm text-[#6d7f99]">
            HR-отчет по ученикам, назначениям и динамике обучения с быстрым переходом в карточку каждого пользователя.
          </p>
        </div>
      </div>

      {sp.notice ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {sp.notice}
        </div>
      ) : null}
      {sp.error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {sp.error}
        </div>
      ) : null}

      <form action={LEARNER_PROGRESS_REPORT_PATH} className="relative mt-6">
        <input type="hidden" name="sort" value={sort} />
        <div className="flex flex-wrap items-center gap-2.5">
          <details className="relative" open={hasAdvancedFilters}>
            <summary className="flex h-12 list-none cursor-pointer items-center gap-3 rounded-2xl border border-[#d6deea] bg-white px-4 text-sm font-medium text-[#4d617c] shadow-[0_8px_20px_rgba(18,40,70,0.04)] transition hover:border-[#bfd6e6] hover:bg-[#f7fbfe] [&::-webkit-details-marker]:hidden">
              <FilterIcon />
              Добавить фильтр
            </summary>
            <div className="mt-3 w-full rounded-[28px] border border-[#dce3ec] bg-white p-5 shadow-[0_16px_32px_rgba(18,40,70,0.12)] md:absolute md:left-0 md:z-20 md:mt-4 md:min-w-[760px]">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">
                    Поиск
                  </span>
                  <input
                    id="reports-search"
                    name="q"
                    defaultValue={sp.q ?? ""}
                    placeholder="ФИО, логин, email, курс..."
                    className="h-11 w-full rounded-2xl border border-[#d6deea] bg-white px-4 text-sm text-[#203451] outline-none ring-[#78c6e2] placeholder:text-[#9aa8bc] focus:ring-2"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">
                    Статус пользователя
                  </span>
                  <select
                    name="userStatus"
                    defaultValue={userStatusFilter}
                    className="h-11 w-full rounded-2xl border border-[#d6deea] bg-white px-4 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
                  >
                    {USER_STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">
                    Группа
                  </span>
                  <select
                    name="groupId"
                    defaultValue={sp.groupId ?? ""}
                    className="h-11 w-full rounded-2xl border border-[#d6deea] bg-white px-4 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
                  >
                    <option value="">Все группы</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">
                    Подразделение
                  </span>
                  <select
                    name="departmentId"
                    defaultValue={sp.departmentId ?? ""}
                    className="h-11 w-full rounded-2xl border border-[#d6deea] bg-white px-4 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
                  >
                    <option value="">Все подразделения</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">
                    С даты регистрации
                  </span>
                  <input
                    type="date"
                    name="registeredFrom"
                    defaultValue={sp.registeredFrom ?? ""}
                    className="h-11 w-full rounded-2xl border border-[#d6deea] bg-white px-4 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">
                    До даты регистрации
                  </span>
                  <input
                    type="date"
                    name="registeredTo"
                    defaultValue={sp.registeredTo ?? ""}
                    className="h-11 w-full rounded-2xl border border-[#d6deea] bg-white px-4 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#edf1f7] pt-5">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0f7c9f] px-4 text-sm font-medium text-white transition hover:bg-[#0c6986]"
                >
                  Применить фильтры
                </button>
                <Link
                  href={buildReportsHref({
                    status: statusFilter,
                    sort,
                    courseId: reportFilters.courseId,
                    assignedRange: reportFilters.assignedRange,
                  })}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#d6deea] bg-white px-4 text-sm font-medium text-[#203451] transition hover:bg-[#f7fbfe]"
                >
                  Сбросить доп. фильтры
                </Link>
              </div>
            </div>
          </details>

          <ToolbarSelect
            label="Статус обучения"
            name="status"
            defaultValue={statusFilter}
            options={STATUS_OPTIONS}
          />
          <ToolbarSelect
            label="Название обучения"
            name="courseId"
            defaultValue={reportFilters.courseId ?? ""}
            options={[{ value: "", label: "Все" }, ...courses.map((course) => ({ value: course.id, label: course.title }))]}
          />
          <ToolbarSelect
            label="Дата назначения"
            name="assignedRange"
            defaultValue={reportFilters.assignedRange ?? ""}
            options={ASSIGNED_RANGE_OPTIONS}
          />

          <details className="relative">
            <summary className="flex h-12 list-none cursor-pointer items-center gap-3 rounded-2xl border border-[#d6deea] bg-white px-4 text-sm font-medium text-[#4d617c] shadow-[0_8px_20px_rgba(18,40,70,0.04)] transition hover:border-[#bfd6e6] hover:bg-[#f7fbfe] [&::-webkit-details-marker]:hidden">
              <ExportIcon />
              Экспорт
              <ChevronDownIcon />
            </summary>
            <div className="mt-3 min-w-[200px] rounded-2xl border border-[#dce3ec] bg-white p-2 shadow-[0_16px_32px_rgba(18,40,70,0.12)] md:absolute md:right-0 md:z-20">
              <Link
                href={buildReportExportHref({
                  ...reportFilters,
                  status: statusFilter,
                  userStatus: userStatusFilter,
                  format: "xlsx",
                })}
                className="flex rounded-xl px-4 py-3 text-sm text-[#203451] transition hover:bg-[#f5f8fc]"
              >
                Excel
              </Link>
              <Link
                href={buildReportExportHref({
                  ...reportFilters,
                  status: statusFilter,
                  userStatus: userStatusFilter,
                  format: "csv",
                })}
                className="flex rounded-xl px-4 py-3 text-sm text-[#203451] transition hover:bg-[#f5f8fc]"
              >
                CSV
              </Link>
            </div>
          </details>

          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#d6deea] bg-white px-4 text-sm font-medium text-[#203451] shadow-[0_8px_20px_rgba(18,40,70,0.04)] transition hover:border-[#bfd6e6] hover:bg-[#f7fbfe]"
          >
            Применить
          </button>

          <Link
            href={LEARNER_PROGRESS_REPORT_PATH}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#d6deea] bg-white px-4 text-sm font-medium text-[#203451] shadow-[0_8px_20px_rgba(18,40,70,0.04)] transition hover:border-[#bfd6e6] hover:bg-[#f7fbfe]"
          >
            Сбросить
          </Link>
        </div>
      </form>

      <div className="mt-4 rounded-2xl border border-[#d6deea] bg-white/70 px-4 py-3 text-sm leading-6 text-[#6d7f99]">
        По умолчанию в отчете учтены только активные пользователи аккаунта. Чтобы добавить заблокированных
        пользователей в отчет, откройте фильтр «Статус пользователя» и выберите «Заблокированный». В отчете
        учитываются только уже назначенные пользователям материалы. Удаленные пользователи в отчете не показываются, а
        удаленные курсы не учитываются.
      </div>

      <section className="mt-8 rounded-[28px] border border-[#dce3ec] bg-white shadow-[0_10px_28px_rgba(18,40,70,0.06)]">
        <div className="flex flex-col gap-6 px-5 py-5 lg:px-6 lg:py-6 xl:flex-row xl:items-center xl:gap-8">
          <div className="flex items-center gap-4 xl:w-[250px] xl:shrink-0">
            <ProgressRing value={metrics.learningPercent} />
            <div>
              <div className="text-sm font-medium text-[#7c8ba3]">Обученность</div>
              <div className="mt-1.5 text-4xl font-semibold tracking-tight text-[#203451] sm:text-[40px]">
                {formatPercent(metrics.learningPercent)}
              </div>
            </div>
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryMetric label="Завершено" value={metrics.completedAssignments} />
            <SummaryMetric label="Не пройдено" value={metrics.failedAssignments} />
            <SummaryMetric label="В процессе" value={metrics.inProgressAssignments} />
            <SummaryMetric label="Не начато" value={metrics.notStartedAssignments} />
            <SummaryMetric label="Просрочено" value={metrics.overdueAssignments} />
          </div>
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-[28px] border border-[#dce3ec] bg-white shadow-[0_10px_28px_rgba(18,40,70,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f7] px-6 py-5">
          <div className="text-[20px] font-semibold tracking-tight text-[#203451]">Учащихся: {data.filteredRows.length}</div>
          <div className="flex flex-wrap gap-3 text-sm text-[#7c8ba3]">
            <span>Заблокированы: {data.summary.blocked}</span>
            <span>Приглашения ожидают регистрации: {data.summary.pendingInvites}</span>
          </div>
        </div>

        {data.filteredRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#6d7f99]">
            {sp.q ? `По запросу «${sp.q}» ничего не найдено.` : "Для выбранного фильтра пока нет учеников."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#dce3ec] bg-[#f7f9fc] text-[#6b7d97]">
                  <th className="px-6 py-4 text-left font-semibold">
                    <Link
                      href={buildReportsHref({
                        q: reportFilters.q,
                        status: statusFilter,
                        sort: nextNameSort,
                        userStatus: userStatusFilter,
                        courseId: reportFilters.courseId,
                        assignedRange: reportFilters.assignedRange,
                        groupId: reportFilters.groupId,
                        departmentId: reportFilters.departmentId,
                        registeredFrom: reportFilters.registeredFrom,
                        registeredTo: reportFilters.registeredTo,
                      })}
                      className="inline-flex items-center gap-2 rounded-lg text-[#4d617c] transition hover:text-[#0f7c9f]"
                      aria-label={`Сортировать по имени ${sort === "name_asc" ? "по убыванию" : "по возрастанию"}`}
                    >
                      Имя пользователя
                      <span aria-hidden="true" className="text-sm text-[#0f7c9f]">
                        {nameSortIndicator}
                      </span>
                    </Link>
                  </th>
                  <th className="px-4 py-4 text-left font-semibold">Обученность</th>
                  <th className="px-4 py-4 text-left font-semibold">Назначений</th>
                  <th className="px-4 py-4 text-left font-semibold">Завершено</th>
                  <th className="px-4 py-4 text-left font-semibold">Не начато</th>
                  <th className="px-4 py-4 text-left font-semibold">В процессе</th>
                </tr>
              </thead>
              <tbody>
                {data.filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-[#edf1f7] align-top last:border-0">
                    <td className="px-6 py-4">
                      <Link href={`/admin/reports/${row.id}`} className="text-base font-medium text-[#203451] transition hover:text-[#0f7c9f]">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <div className="min-w-[160px]">
                        <div className="text-base font-semibold tabular-nums text-[#203451]">
                          {formatPercent(row.averageProgressPercent)}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-base font-medium text-[#203451]">{row.assignedCoursesCount}</td>
                    <td className="px-4 py-4 text-base font-medium text-[#203451]">{row.completedCoursesCount}</td>
                    <td className="px-4 py-4 text-base font-medium text-[#203451]">{row.notStartedCoursesCount}</td>
                    <td className="px-4 py-4 text-base font-medium text-[#203451]">{row.inProgressCoursesCount}</td>
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

const STATUS_OPTIONS: Array<{ value: LearnerReportStatus | ""; label: string }> = [
  { value: "all", label: "Все" },
  { value: "with_assignments", label: "С назначениями" },
  { value: "in_progress", label: "В процессе" },
  { value: "completed", label: "Завершили все" },
  { value: "not_started", label: "Не начали" },
  { value: "no_assignments", label: "Без курсов" },
];

const ASSIGNED_RANGE_OPTIONS = [
  { value: "", label: "Все даты" },
  { value: "30", label: "Последние 30 дней" },
  { value: "90", label: "Последние 90 дней" },
  { value: "180", label: "Последние 180 дней" },
];

const USER_STATUS_FILTER_OPTIONS: Array<{ value: LearnerReportUserStatus; label: string }> = [
  { value: "active", label: "Активный" },
  { value: "blocked", label: "Заблокированный" },
  { value: "all", label: "Активные и заблокированные" },
];

function ToolbarSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        name={name}
        defaultValue={defaultValue}
        className="h-12 min-w-[200px] appearance-none rounded-2xl border border-[#d6deea] bg-white px-4 pr-10 text-sm font-medium text-[#4d617c] shadow-[0_8px_20px_rgba(18,40,70,0.04)] outline-none ring-[#78c6e2] transition focus:ring-2"
      >
        {options.map((option) => (
          <option key={`${name}:${option.value || "empty"}`} value={option.value}>
            {label}: {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#8fa0b6]">
        <ChevronDownIcon />
      </span>
    </label>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-3xl border border-[#edf1f7] bg-[#fbfcfe] px-4 py-4">
      <div className="text-sm font-medium text-[#7c8ba3]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-[#203451] sm:text-[34px]">{value}</div>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(value, 100));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div className="relative h-28 w-28 shrink-0 sm:h-32 sm:w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#edf1f5" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#37b56b"
          strokeLinecap="round"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#f6f9fc] text-[#a5b1bf] sm:h-20 sm:w-20">
          <GraduationSparkIcon />
        </div>
      </div>
    </div>
  );
}

function summarizeLearnerProgress(rows: LearnerReportRow[]) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalAssignments += row.assignedCoursesCount;
      acc.completedAssignments += row.completedCoursesCount;
      acc.failedAssignments += row.failedCoursesCount;
      acc.inProgressAssignments += row.inProgressCoursesCount;
      acc.notStartedAssignments += row.notStartedCoursesCount;
      acc.overdueAssignments += row.overdueCoursesCount;
      acc.learnersWithoutAssignments += row.assignedCoursesCount === 0 ? 1 : 0;
      return acc;
    },
    {
      totalAssignments: 0,
      completedAssignments: 0,
      failedAssignments: 0,
      inProgressAssignments: 0,
      notStartedAssignments: 0,
      overdueAssignments: 0,
      learnersWithoutAssignments: 0,
    }
  );

  return {
    ...totals,
    learningPercent:
      totals.totalAssignments > 0
        ? Math.round((totals.completedAssignments / totals.totalAssignments) * 1000) / 10
        : 0,
  };
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(1)}%`;
}

function buildReportsHref(args: {
  q?: string;
  status?: LearnerReportStatus;
  sort?: LearnerReportSort;
  userStatus?: LearnerReportUserStatus;
  courseId?: string;
  assignedRange?: string;
  groupId?: string;
  departmentId?: string;
  registeredFrom?: string;
  registeredTo?: string;
}) {
  const params = new URLSearchParams();
  if (args.q?.trim()) params.set("q", args.q.trim());
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.sort && args.sort !== "name_asc") params.set("sort", args.sort);
  if (args.userStatus && args.userStatus !== "active") params.set("userStatus", args.userStatus);
  if (args.courseId?.trim()) params.set("courseId", args.courseId.trim());
  if (args.assignedRange?.trim()) params.set("assignedRange", args.assignedRange.trim());
  if (args.groupId?.trim()) params.set("groupId", args.groupId.trim());
  if (args.departmentId?.trim()) params.set("departmentId", args.departmentId.trim());
  if (args.registeredFrom?.trim()) params.set("registeredFrom", args.registeredFrom.trim());
  if (args.registeredTo?.trim()) params.set("registeredTo", args.registeredTo.trim());
  const query = params.toString();
  return query ? `${LEARNER_PROGRESS_REPORT_PATH}?${query}` : LEARNER_PROGRESS_REPORT_PATH;
}

function buildReportExportHref(args: {
  q?: string;
  status?: LearnerReportStatus;
  sort?: LearnerReportSort;
  userStatus?: LearnerReportUserStatus;
  courseId?: string;
  assignedRange?: string;
  groupId?: string;
  departmentId?: string;
  registeredFrom?: string;
  registeredTo?: string;
  format: "csv" | "xlsx";
}) {
  const params = new URLSearchParams();
  if (args.q?.trim()) params.set("q", args.q.trim());
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.sort && args.sort !== "name_asc") params.set("sort", args.sort);
  if (args.userStatus && args.userStatus !== "active") params.set("userStatus", args.userStatus);
  if (args.courseId?.trim()) params.set("courseId", args.courseId.trim());
  if (args.assignedRange?.trim()) params.set("assignedRange", args.assignedRange.trim());
  if (args.groupId?.trim()) params.set("groupId", args.groupId.trim());
  if (args.departmentId?.trim()) params.set("departmentId", args.departmentId.trim());
  if (args.registeredFrom?.trim()) params.set("registeredFrom", args.registeredFrom.trim());
  if (args.registeredTo?.trim()) params.set("registeredTo", args.registeredTo.trim());
  if (args.format === "xlsx") params.set("format", "xlsx");
  const query = params.toString();
  return query ? `${LEARNER_PROGRESS_EXPORT_PATH}?${query}` : LEARNER_PROGRESS_EXPORT_PATH;
}

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M11.5 4.5 6 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 10h8" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M3.5 5.5h13" strokeLinecap="round" />
      <path d="M6 10h8" strokeLinecap="round" />
      <path d="M8.5 14.5h3" strokeLinecap="round" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M9.5 4.5v7" strokeLinecap="round" />
      <path d="m6.5 8.5 3 3 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15.5h11" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GraduationSparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-10 w-10 fill-none stroke-current stroke-[1.7]">
      <path d="m6 18 18-8 18 8-18 8-18-8Z" fill="currentColor" opacity="0.18" />
      <path d="m14 22.5v6.5c0 2.8 5 5 10 5s10-2.2 10-5v-6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m24 10 18 8-18 8-18-8 18-8Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m36 10.5 2 3.5 4 .5-3 2.5.8 4-3.8-1.8-3.8 1.8.8-4-3-2.5 4-.5 2-3.5Z" fill="currentColor" opacity="0.7" strokeLinejoin="round" />
    </svg>
  );
}
