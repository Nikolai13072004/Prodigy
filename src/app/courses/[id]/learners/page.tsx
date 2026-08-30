import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  unenrollCourseLearner,
  updateCourseLearnerAccess,
  updateCourseLearnersAccessBulk,
} from "@/app/actions/course-enrollment-actions";
import { CourseLearnerUnenrollDialog } from "@/components/CourseLearnerUnenrollDialog";
import { toCourseAccessDateInputValue } from "@/lib/course-access-window";
import {
  formatDateTimeRu,
  getCourseLearnerSortDirection,
  getCourseLearnerSortField,
  getLearnerAccessParam,
  getCourseLearnersData,
  getLearnerStatusParam,
  type CourseLearnerSortDirection,
  type CourseLearnerSortField,
  type LearnerAccessFilter,
  type LearnerState,
} from "@/lib/course-learners";
import { requireSession } from "@/lib/auth-guards";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    access?: string;
    sortBy?: string;
    sortDir?: string;
    accessSaved?: string;
    accessError?: string;
    assignmentSaved?: string;
    assignmentError?: string;
  }>;
};

export default async function CourseLearnersPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id: courseId } = await params;
  const sp = await searchParams;
  const statusFilter = getLearnerStatusParam(sp.status);
  const accessFilter = getLearnerAccessParam(sp.access);
  const sortBy = getCourseLearnerSortField(sp.sortBy);
  const sortDir = getCourseLearnerSortDirection(sp.sortDir);

  const data = await getCourseLearnersData({
    courseId,
    user: session.user,
    q: sp.q ?? "",
    statusFilter,
    accessFilter,
    sortBy,
    sortDir,
  });

  if (!data) notFound();
  if (!data.access.canViewLearners) redirect("/");

  const bulkAccessFormId = "bulk-learner-access-form";

  const learnersByAccess =
    accessFilter === "all"
      ? data.learnerRows
      : data.learnerRows.filter((learner) => learner.accessState === accessFilter);
  const statusSummary = {
    total: learnersByAccess.length,
    active: learnersByAccess.filter((learner) => learner.state === "active").length,
    completed: learnersByAccess.filter((learner) => learner.state === "completed").length,
    dropped: learnersByAccess.filter((learner) => learner.state === "dropped").length,
  };
  const buildCurrentLearnersHref = (
    overrides: Partial<{
      q: string;
      status: "all" | "active" | "completed" | "dropped";
      access: LearnerAccessFilter;
      sortBy: CourseLearnerSortField;
      sortDir: CourseLearnerSortDirection;
    }>
  ) =>
    buildLearnersHref(data.course.id, {
      q: sp.q ?? "",
      status: statusFilter,
      access: accessFilter,
      sortBy,
      sortDir,
      ...overrides,
    });
  const sortableHeader = (label: string, field: CourseLearnerSortField) => {
    const active = sortBy === field;
    const nextDir: CourseLearnerSortDirection = active && sortDir === "asc" ? "desc" : "asc";
    const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "↕";

    return (
      <Link
        href={buildCurrentLearnersHref({ sortBy: field, sortDir: nextDir })}
        className="inline-flex items-center gap-1 hover:text-[var(--ink)] hover:underline"
      >
        <span>{label}</span>
        <span aria-hidden>{arrow}</span>
      </Link>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/courses" className="text-sm text-[var(--accent)] underline">
            ← Вернуться к списку курсов
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{data.course.title}</h1>
            <CourseStatusBadge status={data.course.status} />
          </div>
          <p className="mt-3 max-w-3xl text-sm text-[var(--ink-muted)]">
            {data.course.description || "Описание курса пока не заполнено."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildLearnersExportHref(data.course.id, {
              q: sp.q ?? "",
              status: statusFilter,
              access: accessFilter,
              sortBy,
              sortDir,
              format: "xlsx",
            })}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Экспорт Excel
          </Link>
          <Link
            href={buildLearnersExportHref(data.course.id, {
              q: sp.q ?? "",
              status: statusFilter,
              access: accessFilter,
              sortBy,
              sortDir,
              format: "csv",
            })}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            Экспорт CSV
          </Link>
          <Link
            href={`/courses/${data.course.id}/results`}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            Результаты
          </Link>
          {data.access.canManageAssignments ? (
            <Link
              href={`/courses/${data.course.id}/manage?section=assignments`}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              Назначения
            </Link>
          ) : null}
          {data.access.canOpenManage ? (
            <Link
              href={`/courses/${data.course.id}/manage`}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              Управление курсом
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label={accessFilter === "active" ? "С активным доступом" : accessFilter === "expired" ? "С истекшим доступом" : "Записано учеников"}
          value={String(statusSummary.total)}
        />
        <SummaryCard label="Активны" value={String(statusSummary.active)} />
        <SummaryCard label="Завершили" value={String(statusSummary.completed)} />
        <SummaryCard label="Бросили" value={String(statusSummary.dropped)} />
        <SummaryCard label="Доступ активен" value={String(data.summary.activeAccess)} />
        <SummaryCard label="Доступ истек" value={String(data.summary.expiredAccess)} />
      </section>

      {sp.accessSaved ? (
        <div className="mt-6 rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {sp.accessSaved}
        </div>
      ) : null}
      {sp.accessError ? (
        <div className="mt-6 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.accessError}
        </div>
      ) : null}
      {sp.assignmentSaved ? (
        <div className="mt-6 rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {sp.assignmentSaved}
        </div>
      ) : null}
      {sp.assignmentError ? (
        <div className="mt-6 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.assignmentError}
        </div>
      ) : null}

      {data.access.canManageAssignments && data.filteredLearners.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Массовое управление доступом</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Отметьте учеников в таблице и сразу продлите доступ, задайте точную дату или переведите доступ в
                бессрочный режим.
              </p>
            </div>
          </div>

          <form
            id={bulkAccessFormId}
            action={updateCourseLearnersAccessBulk.bind(null, data.course.id)}
            className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,240px)_1fr]"
          >
            <input type="hidden" name="returnQ" value={sp.q ?? ""} />
            <input type="hidden" name="returnStatus" value={statusFilter} />
            <input type="hidden" name="returnAccess" value={accessFilter} />
            <input type="hidden" name="returnSortBy" value={sortBy} />
            <input type="hidden" name="returnSortDir" value={sortDir} />

            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Применить к</span>
                <select
                  name="bulkScope"
                  defaultValue="selected"
                  className="h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
                >
                  <option value="selected">Только выбранные ученики</option>
                  <option value="filtered">Все ученики из текущего фильтра ({data.filteredLearners.length})</option>
                </select>
              </label>

              <p className="text-xs text-[var(--ink-muted)]">
                В режиме «Все ученики из текущего фильтра» будут использованы текущие поиск, статус и фильтр доступа.
              </p>
            </div>

            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Точная дата окончания доступа</span>
                <input
                  type="date"
                  name="accessExpiresOn"
                  className="h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {[30, 60, 90].map((days) => (
                  <button
                    key={`bulk-extend:${days}`}
                    type="submit"
                    name="bulkAction"
                    value={`extend:${days}`}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  >
                    Продлить на {days} дн.
                  </button>
                ))}
                <button
                  type="submit"
                  name="bulkAction"
                  value="set-date"
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                >
                  Сохранить дату
                </button>
                <button
                  type="submit"
                  name="bulkAction"
                  value="unlimited"
                  className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
                >
                  Сделать бессрочным
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <LearnerFilterLink
              href={buildCurrentLearnersHref({ status: "all" })}
              label={`Все (${statusSummary.total})`}
              active={statusFilter === "all"}
            />
            <LearnerFilterLink
              href={buildCurrentLearnersHref({ status: "active" })}
              label={`Активны (${statusSummary.active})`}
              active={statusFilter === "active"}
            />
            <LearnerFilterLink
              href={buildCurrentLearnersHref({ status: "completed" })}
              label={`Завершили (${statusSummary.completed})`}
              active={statusFilter === "completed"}
            />
            <LearnerFilterLink
              href={buildCurrentLearnersHref({ status: "dropped" })}
              label={`Бросили (${statusSummary.dropped})`}
              active={statusFilter === "dropped"}
            />
          </div>

          <form action={`/courses/${data.course.id}/learners`} className="w-full sm:w-80">
            <input type="hidden" name="status" value={statusFilter} />
            <input type="hidden" name="access" value={accessFilter} />
            <input type="hidden" name="sortBy" value={sortBy} />
            <input type="hidden" name="sortDir" value={sortDir} />
            <label htmlFor="learner-search" className="sr-only">
              Поиск ученика
            </label>
            <input
              id="learner-search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Поиск по ФИО, логину, email, группе..."
              className="h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
            />
          </form>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--ink-muted)]">
          <div className="flex flex-wrap gap-2">
            <AccessFilterLink
              href={buildCurrentLearnersHref({ access: "all" })}
              label={`Весь доступ (${data.summary.total})`}
              active={accessFilter === "all"}
            />
            <AccessFilterLink
              href={buildCurrentLearnersHref({ access: "active" })}
              label={`Активен (${data.summary.activeAccess})`}
              active={accessFilter === "active"}
            />
            <AccessFilterLink
              href={buildCurrentLearnersHref({ access: "expired" })}
              label={`Истек (${data.summary.expiredAccess})`}
              active={accessFilter === "expired"}
            />
          </div>
          <span>Показано: {data.filteredLearners.length}</span>
          <span>·</span>
          <span>Приглашения ожидают регистрации: {data.summary.pendingInvites}</span>
          {data.course.publishedAt ? (
            <>
              <span>·</span>
              <span>Опубликован: {formatDateTimeRu(data.course.publishedAt)}</span>
            </>
          ) : null}
        </div>

        {data.filteredLearners.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-sm text-[var(--ink)]">
              {data.summary.total === 0
                ? "На курс пока не назначено ни одного ученика."
                : statusSummary.total === 0
                  ? accessFilter === "expired"
                    ? "Для этого курса пока нет учеников с истекшим доступом."
                    : "Для этого курса пока нет учеников с активным доступом."
                  : sp.q
                    ? `По запросу «${sp.q}» ничего не найдено.`
                    : "Для выбранного статуса учеников пока нет."}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                  <tr>
                    {data.access.canManageAssignments ? (
                      <th className="px-4 py-3 text-left font-medium" />
                    ) : null}
                    <th className="px-4 py-3 text-left font-medium">{sortableHeader("Ученик", "name")}</th>
                    <th className="px-4 py-3 text-left font-medium">{sortableHeader("Подразделение", "department")}</th>
                    <th className="px-4 py-3 text-left font-medium">
                      {sortableHeader("Источник назначения", "assignmentSource")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">{sortableHeader("Группы", "groups")}</th>
                    <th className="px-4 py-3 text-left font-medium">{sortableHeader("Назначен", "assignedAt")}</th>
                    <th className="px-4 py-3 text-left font-medium">
                      {sortableHeader("Последний визит", "lastActivityAt")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">{sortableHeader("Доступ", "access")}</th>
                    <th className="px-4 py-3 text-left font-medium">{sortableHeader("Прогресс", "progress")}</th>
                    <th className="px-4 py-3 text-left font-medium">{sortableHeader("Статус", "status")}</th>
                    {data.access.canManageAssignments ? (
                      <th className="px-4 py-3 text-left font-medium">Управление доступом</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.filteredLearners.map((learner) => (
                    <tr key={learner.id} className="border-t border-[var(--line)] align-top text-[var(--ink)]">
                      {data.access.canManageAssignments ? (
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            name="learnerIds"
                            value={learner.id}
                            form={bulkAccessFormId}
                            aria-label={`Выбрать ученика ${learner.name}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-4">
                        <Link
                          href={`/courses/${data.course.id}/learners/${learner.id}`}
                          className="font-medium text-[var(--ink)] hover:underline"
                        >
                          {learner.name}
                        </Link>
                        <div className="mt-1 text-xs text-[var(--ink-muted)]">Логин: {learner.login}</div>
                        {learner.email ? <div className="mt-1 text-xs text-[var(--ink-muted)]">{learner.email}</div> : null}
                        {learner.accountStatus !== "ACTIVE" ? (
                          <div className="mt-2">
                            <span className="inline-flex rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-medium text-[var(--warning)]">
                              {learner.accountStatusLabel}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">{learner.department}</td>
                      <td className="px-4 py-4">
                        <div className="text-[var(--ink)]">{learner.assignmentSource}</div>
                        {learner.assignedGroups.length > 0 ? (
                          <div className="mt-2 text-xs text-[var(--ink-muted)]">
                            Через группы: {learner.assignedGroups.join(", ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        {learner.groups.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {learner.groups.map((group) => (
                              <span
                                key={`${learner.id}:${group}`}
                                className="inline-flex rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--ink-muted)]"
                              >
                                {group}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--ink-muted)]">Нет групп</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-[var(--ink-muted)]">
                        {learner.assignedAt ? formatDateTimeRu(learner.assignedAt) : "—"}
                      </td>
                      <td className="px-4 py-4 text-xs text-[var(--ink-muted)]">
                        {learner.lastActivityAt ? formatDateTimeRu(learner.lastActivityAt) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <AccessBadge state={learner.accessState} label={learner.accessStateLabel} />
                        <div className="mt-2 text-xs text-[var(--ink-muted)]">
                          {learner.hasUnlimitedAccess
                            ? "Без ограничения по сроку"
                            : learner.accessExpiresAt
                              ? `До ${formatDateTimeRu(learner.accessExpiresAt)}`
                              : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="min-w-[180px]">
                          <div className="flex items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                            <span>
                              {learner.progress.completedRequired}/{learner.progress.requiredTotal || 0} этапов
                            </span>
                            <span>{learner.progress.percent}%</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[var(--line)]">
                            <div
                              className="h-2 rounded-full bg-[var(--accent)] transition-all"
                              style={{ width: `${learner.progress.percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <LearnerStateBadge state={learner.state} />
                      </td>
                      {data.access.canManageAssignments ? (
                        <td className="px-4 py-3">
                          <details className="min-w-[180px]">
                            <summary className="inline-flex cursor-pointer list-none items-center rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]">
                              Управление
                            </summary>
                            <div className="mt-3 w-[280px] space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-[var(--ink-muted)]">Быстро продлить</div>
                                <div className="grid grid-cols-3 gap-2">
                                  {[30, 60, 90].map((days) => (
                                    <form
                                      key={`${learner.id}:extend:${days}`}
                                      action={updateCourseLearnerAccess.bind(null, data.course.id, learner.id)}
                                    >
                                      <input type="hidden" name="mode" value="EXTEND" />
                                      <input type="hidden" name="days" value={String(days)} />
                                      <input type="hidden" name="returnTo" value="learners" />
                                      <input type="hidden" name="returnQ" value={sp.q ?? ""} />
                                      <input type="hidden" name="returnStatus" value={statusFilter} />
                                      <input type="hidden" name="returnAccess" value={accessFilter} />
                                      <input type="hidden" name="returnSortBy" value={sortBy} />
                                      <input type="hidden" name="returnSortDir" value={sortDir} />
                                      <button
                                        type="submit"
                                        disabled={learner.hasUnlimitedAccess}
                                        className="w-full rounded-xl border border-[var(--line)] bg-white px-2 py-2 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        +{days} дн.
                                      </button>
                                    </form>
                                  ))}
                                </div>
                              </div>

                              <form
                                action={updateCourseLearnerAccess.bind(null, data.course.id, learner.id)}
                                className="space-y-2"
                              >
                                <input type="hidden" name="mode" value="SET_DATE" />
                                <input type="hidden" name="returnTo" value="learners" />
                                <input type="hidden" name="returnQ" value={sp.q ?? ""} />
                                <input type="hidden" name="returnStatus" value={statusFilter} />
                                <input type="hidden" name="returnAccess" value={accessFilter} />
                                <input type="hidden" name="returnSortBy" value={sortBy} />
                                <input type="hidden" name="returnSortDir" value={sortDir} />
                                <label className="block">
                                  <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">
                                    Дата окончания доступа
                                  </span>
                                  <input
                                    type="date"
                                    name="accessExpiresOn"
                                    required
                                    defaultValue={accessDateInputValue(learner.accessExpiresAt)}
                                    className="h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                                >
                                  Сохранить дату
                                </button>
                              </form>

                              {!learner.hasUnlimitedAccess ? (
                                <form action={updateCourseLearnerAccess.bind(null, data.course.id, learner.id)}>
                                  <input type="hidden" name="mode" value="UNLIMITED" />
                                  <input type="hidden" name="returnTo" value="learners" />
                                  <input type="hidden" name="returnQ" value={sp.q ?? ""} />
                                  <input type="hidden" name="returnStatus" value={statusFilter} />
                                  <input type="hidden" name="returnAccess" value={accessFilter} />
                                  <input type="hidden" name="returnSortBy" value={sortBy} />
                                  <input type="hidden" name="returnSortDir" value={sortDir} />
                                  <button
                                    type="submit"
                                    className="w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
                                  >
                                    Сделать бессрочным
                                  </button>
                                </form>
                              ) : (
                                <div className="rounded-xl bg-[var(--success-soft)] px-3 py-2 text-xs font-medium text-[var(--success)]">
                                  Уже бессрочный доступ
                                </div>
                              )}

                              <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
                                <div className="text-xs font-medium text-[var(--danger)]">Отчисление</div>
                                <p className="mt-1 text-xs text-[var(--danger)]">
                                  Закрыть доступ к курсу и при необходимости очистить прогресс только по этому курсу.
                                </p>
                                <div className="mt-3">
                                  <CourseLearnerUnenrollDialog
                                    action={unenrollCourseLearner.bind(null, data.course.id, learner.id)}
                                    learnerName={learner.name}
                                    courseTitle={data.course.title}
                                    hiddenFields={{
                                      returnTo: "learners",
                                      returnQ: sp.q ?? "",
                                      returnStatus: statusFilter,
                                      returnAccess: accessFilter,
                                      returnSortBy: sortBy,
                                      returnSortDir: sortDir,
                                    }}
                                    buttonClassName="w-full rounded-xl border border-[var(--danger)] bg-white px-3 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                                  />
                                </div>
                              </div>
                            </div>
                          </details>
                        </td>
                      ) : null}
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

function accessDateInputValue(value: Date | null) {
  return value ? toCourseAccessDateInputValue(value) : "";
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
      <div className="mt-1 text-sm text-[var(--ink-muted)]">{label}</div>
    </div>
  );
}

function LearnerFilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "bg-white font-medium text-[var(--accent)] shadow-[inset_0_-3px_0_var(--accent)]"
          : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      {label}
    </Link>
  );
}

function AccessFilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? "border-[var(--line)] bg-white font-medium text-[var(--accent)] shadow-[inset_0_-3px_0_var(--accent)]"
          : "border-[var(--line)] bg-white text-[var(--ink-muted)] hover:border-[var(--line)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      {label}
    </Link>
  );
}

function CourseStatusBadge({ status }: { status: string }) {
  const classes =
    status === "PUBLISHED" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]";
  const label = status === "PUBLISHED" ? "Опубликован" : "Черновик";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>{label}</span>;
}

function LearnerStateBadge({ state }: { state: LearnerState }) {
  const meta =
    state === "completed"
      ? { label: "Завершил", classes: "bg-[var(--success-soft)] text-[var(--success)]" }
      : state === "dropped"
        ? { label: "Бросил", classes: "bg-[var(--warning-soft)] text-[var(--warning)]" }
        : { label: "Активен", classes: "bg-[var(--info-soft)] text-[var(--info)]" };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${meta.classes}`}>{meta.label}</span>;
}

function AccessBadge({ state, label }: { state: "active" | "expired"; label: string }) {
  const className =
    state === "active" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function buildLearnersHref(
  courseId: string,
  options: {
    q: string;
    status: "all" | "active" | "completed" | "dropped";
    access: LearnerAccessFilter;
    sortBy: CourseLearnerSortField;
    sortDir: CourseLearnerSortDirection;
  }
) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.status !== "all") params.set("status", options.status);
  if (options.access !== "all") params.set("access", options.access);
  if (options.sortBy !== "name") params.set("sortBy", options.sortBy);
  if (options.sortDir !== "asc") params.set("sortDir", options.sortDir);

  const query = params.toString();
  return query ? `/courses/${courseId}/learners?${query}` : `/courses/${courseId}/learners`;
}

function buildLearnersExportHref(
  courseId: string,
  options: {
    q: string;
    status: "all" | "active" | "completed" | "dropped";
    access: LearnerAccessFilter;
    sortBy: CourseLearnerSortField;
    sortDir: CourseLearnerSortDirection;
    format: "csv" | "xlsx";
  }
) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.status !== "all") params.set("status", options.status);
  if (options.access !== "all") params.set("access", options.access);
  if (options.sortBy !== "name") params.set("sortBy", options.sortBy);
  if (options.sortDir !== "asc") params.set("sortDir", options.sortDir);
  if (options.format !== "csv") params.set("format", options.format);

  const query = params.toString();
  return query ? `/courses/${courseId}/learners/export?${query}` : `/courses/${courseId}/learners/export`;
}
