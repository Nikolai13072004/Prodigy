import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  formatDateTimeRu,
  getCourseResultsData,
  getResultStatusParam,
  type ResultStatusFilter,
} from "@/lib/course-results";
import { requireSession } from "@/lib/auth-guards";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
};

export default async function CourseResultsPage({ params, searchParams }: Props) {
  const session = await requireSession();
  const { id: courseId } = await params;
  const sp = await searchParams;
  const statusFilter = getResultStatusParam(sp.status);

  const data = await getCourseResultsData({
    courseId,
    user: session.user,
    q: sp.q ?? "",
    statusFilter,
  });

  if (!data) notFound();
  if (!data.access.canViewResults) redirect("/");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/courses" className="text-sm text-teal-700 underline">
            ← Вернуться к списку курсов
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">{data.course.title}</h1>
            <CourseStatusBadge status={data.course.status} />
          </div>
          <p className="mt-3 max-w-3xl text-sm text-zinc-600">
            {data.course.description || "Описание курса пока не заполнено."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildResultsExportHref(data.course.id, {
              q: sp.q ?? "",
              status: statusFilter,
              format: "xlsx",
            })}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Экспорт Excel
          </Link>
          <Link
            href={buildResultsExportHref(data.course.id, {
              q: sp.q ?? "",
              status: statusFilter,
              format: "csv",
            })}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Экспорт CSV
          </Link>
          <Link
            href={`/courses/${data.course.id}/learners`}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Ученики
          </Link>
          {data.access.canManageAssignments ? (
            <Link
              href={`/courses/${data.course.id}/manage?section=assignments`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Назначения
            </Link>
          ) : null}
          {data.access.canOpenManage ? (
            <Link
              href={`/courses/${data.course.id}/manage?section=reports`}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Управление курсом
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-5">
        <SummaryCard label="Ученики в отчете" value={String(data.summary.total)} />
        <SummaryCard label="С попытками" value={String(data.summary.withAttempts)} />
        <SummaryCard label="Пройдены" value={String(data.summary.passed)} />
        <SummaryCard label="В работе" value={String(data.summary.inProgress)} />
        <SummaryCard label="Не пройдены" value={String(data.summary.failed)} />
      </section>

      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <ResultFilterLink
              href={buildResultsHref(data.course.id, { q: sp.q ?? "", status: "all" })}
              label={`Все (${data.summary.total})`}
              active={statusFilter === "all"}
            />
            <ResultFilterLink
              href={buildResultsHref(data.course.id, { q: sp.q ?? "", status: "passed" })}
              label={`Пройдены (${data.summary.passed})`}
              active={statusFilter === "passed"}
            />
            <ResultFilterLink
              href={buildResultsHref(data.course.id, { q: sp.q ?? "", status: "in_progress" })}
              label={`В работе (${data.summary.inProgress})`}
              active={statusFilter === "in_progress"}
            />
            <ResultFilterLink
              href={buildResultsHref(data.course.id, { q: sp.q ?? "", status: "failed" })}
              label={`Не пройдены (${data.summary.failed})`}
              active={statusFilter === "failed"}
            />
            <ResultFilterLink
              href={buildResultsHref(data.course.id, { q: sp.q ?? "", status: "not_started" })}
              label={`Не начали (${data.summary.notStarted})`}
              active={statusFilter === "not_started"}
            />
          </div>

          <form action={`/courses/${data.course.id}/results`} className="w-full sm:w-80">
            <input type="hidden" name="status" value={statusFilter} />
            <label htmlFor="result-search" className="sr-only">
              Поиск ученика
            </label>
            <input
              id="result-search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Поиск по ФИО, логину, email, группе..."
              className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
          </form>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-500">
          <span>Показано: {data.filteredRows.length}</span>
          <span>·</span>
          <span>Тестов в курсе: {data.summary.quizCount}</span>
          <span>·</span>
          <span>Приглашения ожидают регистрации: {data.summary.pendingInvites}</span>
          {data.course.publishedAt ? (
            <>
              <span>·</span>
              <span>Опубликован: {formatDateTimeRu(data.course.publishedAt)}</span>
            </>
          ) : null}
        </div>

        {data.summary.quizCount === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center text-sm text-zinc-700">
            В курсе пока нет тестов. Как только в структуре появится тестовый элемент, здесь начнут собираться результаты.
          </div>
        ) : data.filteredRows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center">
            <p className="text-sm text-zinc-700">
              {data.summary.total === 0
                ? "На курс пока не назначено ни одного ученика."
                : sp.q
                  ? `По запросу «${sp.q}» ничего не найдено.`
                  : "Для выбранного статуса результатов пока нет."}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Ученик</th>
                    <th className="px-4 py-3 text-left font-medium">Подразделение</th>
                    <th className="px-4 py-3 text-left font-medium">Группы</th>
                    <th className="px-4 py-3 text-left font-medium">Прогресс</th>
                    <th className="px-4 py-3 text-left font-medium">Тесты</th>
                    <th className="px-4 py-3 text-left font-medium">Лучший результат</th>
                    <th className="px-4 py-3 text-left font-medium">Попытки</th>
                    <th className="px-4 py-3 text-left font-medium">Последняя попытка</th>
                    <th className="px-4 py-3 text-left font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-200 align-top text-zinc-700">
                      <td className="px-4 py-4">
                        <Link
                          href={`/courses/${data.course.id}/learners/${row.id}`}
                          className="font-medium text-zinc-950 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <div className="mt-1 text-xs text-zinc-500">Логин: {row.login}</div>
                        {row.email ? <div className="mt-1 text-xs text-zinc-500">{row.email}</div> : null}
                        {row.accountStatus !== "ACTIVE" ? (
                          <div className="mt-2">
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                              {row.accountStatusLabel}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">{row.department}</td>
                      <td className="px-4 py-4">
                        {row.groups.length > 0 ? (
                          <div className="flex min-w-[180px] flex-wrap gap-1.5">
                            {row.groups.map((group) => (
                              <span
                                key={`${row.id}:${group}`}
                                className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600"
                              >
                                {group}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-400">Нет групп</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="min-w-[160px]">
                          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                            <span>
                              {row.progress.completedRequired}/{row.progress.requiredTotal || 0} этапов
                            </span>
                            <span>{row.progress.percent}%</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-zinc-200">
                            <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${row.progress.percent}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-zinc-900">
                        {row.quizCount > 0 ? `${row.passedQuizCount}/${row.quizCount}` : "—"}
                      </td>
                      <td className="px-4 py-4">
                        {row.quizCount > 0 ? (
                          <div>
                            <div className="font-medium text-zinc-950">
                              {row.bestScore}/{row.maxScore}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">{row.bestScorePercent}%</div>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-zinc-900">
                        {row.quizCount > 0 ? `${row.attemptsUsed}/${row.attemptsMax}` : "—"}
                      </td>
                      <td className="px-4 py-4 text-xs text-zinc-500">
                        {row.lastAttemptAt ? formatDateTimeRu(row.lastAttemptAt) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <ResultStatusBadge status={row.resultStatusCode} label={row.resultStatusLabel} />
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold tracking-tight text-zinc-950">{value}</div>
      <div className="mt-1 text-sm text-zinc-500">{label}</div>
    </div>
  );
}

function ResultFilterLink({
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
      className={`rounded-md px-4 py-2 text-sm transition ${
        active
          ? "bg-white font-medium text-[#0f315d] shadow-[inset_0_-3px_0_#0f315d]"
          : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
      }`}
    >
      {label}
    </Link>
  );
}

function CourseStatusBadge({ status }: { status: string }) {
  const isPublished = status === "PUBLISHED";
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
        isPublished ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {isPublished ? "Опубликован" : "Черновик"}
    </span>
  );
}

function ResultStatusBadge({ status, label }: { status: string; label: string }) {
  const className =
    status === "PASSED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "FAILED"
        ? "bg-rose-100 text-rose-700"
        : status === "IN_PROGRESS"
          ? "bg-sky-100 text-sky-700"
          : "bg-zinc-100 text-zinc-600";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function buildResultsHref(
  courseId: string,
  args: {
    q?: string;
    status?: ResultStatusFilter;
  }
) {
  const params = new URLSearchParams();
  if (args.q?.trim()) params.set("q", args.q.trim());
  if (args.status && args.status !== "all") params.set("status", args.status);
  const query = params.toString();
  return query ? `/courses/${courseId}/results?${query}` : `/courses/${courseId}/results`;
}

function buildResultsExportHref(
  courseId: string,
  args: {
    q?: string;
    status?: ResultStatusFilter;
    format: "csv" | "xlsx";
  }
) {
  const params = new URLSearchParams();
  if (args.q?.trim()) params.set("q", args.q.trim());
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.format === "xlsx") params.set("format", "xlsx");
  const query = params.toString();
  return query ? `/courses/${courseId}/results/export?${query}` : `/courses/${courseId}/results/export`;
}
