import Link from "next/link";
import { notFound } from "next/navigation";
import { blockLearnerAsHr } from "@/app/actions/hr-learner-actions";
import { Select } from "@/components/ui";
import { requirePermission } from "@/lib/auth-guards";
import {
  LEARNER_COMMUNICATION_TYPE_OPTIONS,
  getLearnerReportDetailData,
  type LearnerCommunicationFilters,
  type LearnerCommunicationFilterType,
  type LearnerReportDetailData,
  type LearnerTimelineRow,
} from "@/lib/learner-report-detail";
import { formatDateTimeRu } from "@/lib/learners-report";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

type Props = {
  params: Promise<{ learnerId: string }>;
  searchParams: Promise<{
    tab?: string;
    communicationType?: string;
    communicationFrom?: string;
    communicationTo?: string;
    fromUser?: string;
  }>;
};

type LearnerPageTab = "progress" | "notifications" | "timeline";

export default async function LearnerReportDetailPage({ params, searchParams }: Props) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const { learnerId } = await params;
  const sp = await searchParams;
  const activeTab = getLearnerPageTab(sp.tab);
  const cameFromUserCard = sp.fromUser === "1";
  const communicationFilters: LearnerCommunicationFilters = {
    type: getLearnerCommunicationFilterType(sp.communicationType),
    dateFrom: sp.communicationFrom ?? "",
    dateTo: sp.communicationTo ?? "",
  };
  const data = await getLearnerReportDetailData(learnerId, communicationFilters);
  const canEditLearnerProfile = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_PROFILE,
    session.user.permissions
  );

  if (!data) notFound();

  return (
    <main className="mx-auto max-w-6xl">
      <Link
        href={
          cameFromUserCard
            ? `/admin/users/${data.learner.id}/edit`
            : "/admin/reports/learner-progress"
        }
        className="text-sm text-[var(--success)] underline"
      >
        {cameFromUserCard
          ? "← Назад к пользователю"
          : "← К отчету «Прогресс учащихся»"}
      </Link>

      <section className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <LearnerAvatar
              name={data.learner.name}
              avatarUrl={data.learner.avatarUrl}
            />
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{data.learner.name}</h1>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Логин: {data.learner.login}
                {data.learner.email ? ` · Email: ${data.learner.email}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
              {data.learner.accountStatusLabel}
            </span>
            {canEditLearnerProfile ? (
              <Link
                href={`/admin/users/${data.learner.id}/edit`}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                Редактировать профиль
              </Link>
            ) : null}
            <form action={blockLearnerAsHr.bind(null, data.learner.id, undefined)}>
              <button
                type="submit"
                disabled={data.learner.accountStatus !== "ACTIVE" && data.learner.accountStatus !== "PENDING"}
                className="rounded-xl border border-[var(--danger)] px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Заблокировать ученика
              </button>
            </form>
            <p className="max-w-xs text-right text-xs text-[var(--ink-muted)]">
              После блокировки ученик исчезнет из активных списков и будет доступен в архиве HR-отчетов.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Подразделение" value={data.learner.department} />
          <InfoCard
            label="Группы"
            value={data.learner.groups.length ? data.learner.groups.join(", ") : "Нет групп"}
          />
          <InfoCard label="Дата регистрации" value={formatDateTimeRu(data.learner.createdAt)} />
          <InfoCard
            label="Последний вход"
            value={data.learner.lastLoginAt ? formatDateTimeRu(data.learner.lastLoginAt) : "—"}
          />
        </dl>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Назначено курсов" value={String(data.summary.assignedCoursesCount)} />
        <MetricCard label="Завершено" value={String(data.summary.completedCoursesCount)} />
        <MetricCard label="В обучении" value={String(data.summary.inProgressCoursesCount)} />
        <MetricCard label="Не начали" value={String(data.summary.notStartedCoursesCount)} />
        <MetricCard label="Средний прогресс" value={`${data.summary.averageProgressPercent}%`} />
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2">
        <nav className="flex flex-wrap gap-2 px-1 py-1">
          <TabLink
            href={buildLearnerReportHref({
              learnerId: data.learner.id,
              tab: "progress",
              communicationType: communicationFilters.type,
              communicationFrom: communicationFilters.dateFrom,
              communicationTo: communicationFilters.dateTo,
              fromUser: cameFromUserCard,
            })}
            active={activeTab === "progress"}
            label="Прогресс"
          />
          <TabLink
            href={buildLearnerReportHref({
              learnerId: data.learner.id,
              tab: "timeline",
              communicationType: communicationFilters.type,
              communicationFrom: communicationFilters.dateFrom,
              communicationTo: communicationFilters.dateTo,
              fromUser: cameFromUserCard,
            })}
            active={activeTab === "timeline"}
            label="Хронология"
          />
          <TabLink
            href={buildLearnerReportHref({
              learnerId: data.learner.id,
              tab: "notifications",
              communicationType: communicationFilters.type,
              communicationFrom: communicationFilters.dateFrom,
              communicationTo: communicationFilters.dateTo,
              fromUser: cameFromUserCard,
            })}
            active={activeTab === "notifications"}
            label="Уведомления"
          />
        </nav>
      </section>

      {activeTab === "progress" ? (
        <LearnerProgressSection data={data} />
      ) : activeTab === "timeline" ? (
        <LearnerTimelineSection rows={data.timeline} />
      ) : (
        <LearnerCommunicationsSection
          learnerId={data.learner.id}
          learnerEmail={data.learner.email}
          communications={data.communications}
          filters={communicationFilters}
          fromUser={cameFromUserCard}
        />
      )}
    </main>
  );
}

function LearnerAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--info)] bg-[var(--info-soft)] text-2xl font-semibold text-[var(--ink)] shadow-sm">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

function getInitials(input: string) {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function LearnerTimelineSection({ rows }: { rows: LearnerTimelineRow[] }) {
  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Хронология ученика</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Единая лента назначений, открытий материалов, попыток тестов, писем и действий с аккаунтом.
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
          Событий: {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
          Пока нет событий по этому ученику.
        </div>
      ) : (
        <ol className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={`${row.type}-${row.id}`} className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <TimelineTypeBadge row={row} />
                    <span className="text-xs text-[var(--ink-muted)]">{formatDateTimeRu(row.occurredAt)}</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-[var(--ink)]">{row.title}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">{row.summary}</p>
                </div>
                {row.href ? (
                  <Link
                    href={row.href}
                    className="shrink-0 rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  >
                    Открыть
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineTypeBadge({ row }: { row: LearnerTimelineRow }) {
  const className =
    row.type === "quiz_attempt"
      ? "bg-[var(--warning-soft)] text-[var(--warning)]"
      : row.type === "material_view"
        ? "bg-[var(--info-soft)] text-[var(--info)]"
        : row.type === "communication"
          ? "bg-[var(--info-soft)] text-[var(--info)]"
          : row.type === "feedback"
            ? "bg-[var(--success-soft)] text-[var(--success)]"
            : row.type === "account"
              ? "bg-[var(--danger-soft)] text-[var(--danger)]"
              : "bg-[var(--surface)] text-[var(--ink)]";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>{row.typeLabel}</span>;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
      <div className="mt-1 text-sm text-[var(--ink-muted)]">{label}</div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">{label}</dt>
      <dd className="mt-2 font-medium text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function CourseStateBadge({
  label,
  state,
}: {
  label: string;
  state: "completed" | "in_progress" | "not_started";
}) {
  const className =
    state === "completed"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : state === "in_progress"
        ? "bg-[var(--info-soft)] text-[var(--info)]"
        : "bg-[var(--warning-soft)] text-[var(--warning)]";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function LearnerProgressSection({ data }: { data: LearnerReportDetailData }) {
  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Прогресс по всем курсам</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Здесь видно, как ученик проходит каждый назначенный курс, и можно быстро перейти в детализацию по
            конкретному курсу.
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
          Курсов: {data.courses.length}
        </span>
      </div>

      {data.courses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
          У этого ученика пока нет назначенных опубликованных курсов.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Курс</th>
                  <th className="px-4 py-3 text-left font-medium">Дата записи</th>
                  <th className="px-4 py-3 text-left font-medium">Обязательный тест</th>
                  <th className="px-4 py-3 text-left font-medium">Прогресс</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-left font-medium">Последняя активность</th>
                  <th className="px-4 py-3 text-right font-medium">Детали</th>
                </tr>
              </thead>
              <tbody>
                {data.courses.map((course) => (
                  <tr key={course.id} className="border-t border-[var(--line)] align-top text-[var(--ink)]">
                    <td className="px-4 py-4">
                      <div className="font-medium text-[var(--ink)]">{course.title}</div>
                      <div className="mt-1 text-xs text-[var(--ink-muted)]">
                        {course.assignedGroups.length
                          ? `Назначен через группы: ${course.assignedGroups.join(", ")}`
                          : "Прямое назначение или индивидуальный доступ"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-[var(--ink-muted)]">
                      {course.assignedAt ? formatDateTimeRu(course.assignedAt) : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <RequiredQuizStatusBadge
                        label={course.requiredQuizStatusLabel}
                        status={course.requiredQuizStatus}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="min-w-[180px]">
                        <div className="flex items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                          <span>
                            {course.completedRequired}/{course.requiredTotal || 0} этапов
                          </span>
                          <span>{course.progressPercent}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-[var(--line)]">
                          <div
                            className="h-2 rounded-full bg-[var(--accent)]"
                            style={{ width: `${Math.max(0, Math.min(course.progressPercent, 100))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <CourseStateBadge label={course.stateLabel} state={course.state} />
                    </td>
                    <td className="px-4 py-4 text-xs text-[var(--ink-muted)]">
                      {course.lastActivityAt ? formatDateTimeRu(course.lastActivityAt) : "—"}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/courses/${course.id}/learners/${data.learner.id}`}
                        className="inline-flex rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                      >
                        Открыть курс
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function LearnerCommunicationsSection({
  learnerId,
  learnerEmail,
  communications,
  filters,
  fromUser,
}: {
  learnerId: string;
  learnerEmail: string | null;
  communications: LearnerReportDetailData["communications"];
  filters: LearnerCommunicationFilters;
  fromUser: boolean;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">История коммуникаций</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Здесь собраны письма, которые уже отправлялись ученику или стоят в очереди на отправку.
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
          Писем: {communications.length}
        </span>
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,180px)_minmax(0,180px)_auto]">
        <input type="hidden" name="tab" value="notifications" />
        {fromUser ? <input type="hidden" name="fromUser" value="1" /> : null}

        <label className="block text-sm font-medium text-[var(--ink)]">
          Тип
          <Select
            name="communicationType"
            defaultValue={filters.type}
            className="mt-2 w-full"
          >
            {LEARNER_COMMUNICATION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          С даты
          <input
            type="date"
            name="communicationFrom"
            defaultValue={filters.dateFrom}
            className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          По дату
          <input
            type="date"
            name="communicationTo"
            defaultValue={filters.dateTo}
            className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="submit"
            className="h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Применить
          </button>
          <Link
            href={buildLearnerReportHref({
              learnerId,
              tab: "notifications",
              fromUser,
            })}
            className="inline-flex h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            Сбросить
          </Link>
        </div>
      </form>

      {!learnerEmail ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
          У ученика не указан email, поэтому история email-коммуникаций пока недоступна.
        </div>
      ) : communications.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
          По текущим фильтрам коммуникаций пока нет.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Дата</th>
                  <th className="px-4 py-3 text-left font-medium">Тип</th>
                  <th className="px-4 py-3 text-left font-medium">Статус</th>
                  <th className="px-4 py-3 text-left font-medium">Сообщение</th>
                </tr>
              </thead>
              <tbody>
                {communications.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--line)] align-top text-[var(--ink)]">
                    <td className="px-4 py-4 text-xs text-[var(--ink-muted)]">{formatDateTimeRu(item.communicationAt)}</td>
                    <td className="px-4 py-4">
                      <CommunicationTypeBadge label={item.typeLabel} type={item.type} />
                    </td>
                    <td className="px-4 py-4">
                      <CommunicationStatusBadge label={item.statusLabel} status={item.status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-[var(--ink)]">{item.subject}</div>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--ink-muted)]">{item.summary}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function RequiredQuizStatusBadge({
  label,
  status,
}: {
  label: string;
  status: LearnerReportDetailData["courses"][number]["requiredQuizStatus"];
}) {
  const className =
    status === "PASSED"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : status === "FAILED"
        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : status === "PENDING_REVIEW"
          ? "bg-violet-50 text-violet-700"
          : status === "IN_PROGRESS"
            ? "bg-[var(--warning-soft)] text-[var(--warning)]"
            : status === "NOT_STARTED"
              ? "bg-[var(--surface)] text-[var(--ink-muted)]"
              : "bg-[var(--info-soft)] text-[var(--info)]";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] shadow-[inset_0_-3px_0_#0f315d]"
          : "rounded-xl px-4 py-2 text-sm font-medium text-[var(--ink-muted)] hover:bg-white/70"
      }
    >
      {label}
    </Link>
  );
}

function CommunicationTypeBadge({
  label,
  type,
}: {
  label: string;
  type: Exclude<LearnerCommunicationFilterType, "all">;
}) {
  const className =
    type === "course_assigned"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : type === "course_broadcast"
        ? "bg-fuchsia-100 text-fuchsia-700"
        : type === "course_invite"
        ? "bg-[var(--info-soft)] text-[var(--info)]"
        : type === "student_invite"
          ? "bg-[var(--warning-soft)] text-[var(--warning)]"
          : type === "user_activation"
            ? "bg-[var(--info-soft)] text-[var(--info)]"
            : type === "user_access_password_reset"
              ? "bg-[var(--danger-soft)] text-[var(--danger)]"
              : "bg-[var(--surface)] text-[var(--ink)]";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function CommunicationStatusBadge({ label, status }: { label: string; status: string }) {
  const className =
    status === "SENT"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : status === "PROCESSING"
        ? "bg-[var(--info-soft)] text-[var(--info)]"
        : status === "FAILED"
          ? "bg-[var(--danger-soft)] text-[var(--danger)]"
          : "bg-[var(--warning-soft)] text-[var(--warning)]";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function getLearnerPageTab(value: string | undefined): LearnerPageTab {
  if (value === "timeline") return "timeline";
  return value === "notifications" ? "notifications" : "progress";
}

function getLearnerCommunicationFilterType(value: string | undefined): LearnerCommunicationFilterType {
  const normalized = value?.trim() ?? "";
  if (
    LEARNER_COMMUNICATION_TYPE_OPTIONS.some((option) => option.value === normalized && option.value !== "all")
  ) {
    return normalized as LearnerCommunicationFilterType;
  }
  return "all";
}

function buildLearnerReportHref(args: {
  learnerId: string;
  tab: LearnerPageTab;
  communicationType?: LearnerCommunicationFilterType;
  communicationFrom?: string;
  communicationTo?: string;
  fromUser?: boolean;
}) {
  const params = new URLSearchParams();
  if (args.fromUser) params.set("fromUser", "1");
  if (args.tab !== "progress") params.set("tab", args.tab);
  if (args.communicationType && args.communicationType !== "all") {
    params.set("communicationType", args.communicationType);
  }
  if (args.communicationFrom?.trim()) params.set("communicationFrom", args.communicationFrom.trim());
  if (args.communicationTo?.trim()) params.set("communicationTo", args.communicationTo.trim());
  const query = params.toString();
  return query ? `/admin/reports/${args.learnerId}?${query}` : `/admin/reports/${args.learnerId}`;
}
