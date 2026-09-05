import Link from "next/link";
import { dismissHrNotification, restoreHrNotification } from "@/app/actions/hr-notification-actions";
import { Select } from "@/components/ui";
import {
  type HrNotificationItem,
  type HrNotificationType,
  getHrNotificationFeed,
} from "@/lib/hr-notifications";
import { getHrCourseAnalyticsData, type HrCourseSummaryRow } from "@/lib/hr-course-analytics";
import prisma from "@/lib/prisma";
import { formatDateRu, formatDateTimeRu } from "./_home-parts";

// HR-дашборд главной («Оповещения»). Вынесен из page.tsx (ADR-013 IA-B):
// самостоятельный интерфейс на ~1200 строк со своими фильтрами, приоритетами,
// трендами и презентационными бейджами.

export type HrHomeSearchParams = {
  eventType?: string;
  courseId?: string;
  groupId?: string;
  status?: string;
  priority?: string;
};

type HrHomeFilters = {
  eventType: HrNotificationType | "all";
  courseId: string;
  groupId: string;
  status: "active" | "processed" | "all";
  priority: "all" | "urgent";
};

export async function HrHomePage({ userId, searchParams }: { userId: string; searchParams: HrHomeSearchParams }) {
  const filters = normalizeHrHomeFilters(searchParams);
  const [notifications, courseOptions, groupOptions, selectedGroupMemberships, courseAnalytics] = await Promise.all([
    getHrNotificationFeed(userId, { includeDismissed: true }),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.group.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    filters.groupId
      ? prisma.groupMembership.findMany({
          where: { groupId: filters.groupId },
          select: { userId: true },
        })
      : Promise.resolve([] as Array<{ userId: string }>),
    getHrCourseAnalyticsData({ statusFilter: "published" }),
  ]);

  const now = new Date();
  const selectedGroupLearnerIds = new Set(selectedGroupMemberships.map((membership) => membership.userId));
  const activeItems = notifications.items.filter((item) => !item.isDismissed);
  const activeSummary = summarizeHrItems(activeItems);
  const filteredItems = filterHrItems(
    notifications.items,
    filters,
    selectedGroupLearnerIds,
    notifications.preferences,
    now
  );
  const selectedCourse = filters.courseId
    ? courseOptions.find((course) => course.id === filters.courseId)
    : null;
  const selectedGroup = filters.groupId ? groupOptions.find((group) => group.id === filters.groupId) : null;
  const currentReturnTo = buildHrHomeHref(filters, "hr-event-feed");
  const defaultFeedFilters = getDefaultHrHomeFilters();
  const urgentEventsHref = buildHrHomeHref(
    { ...defaultFeedFilters, priority: "urgent" },
    "hr-event-feed"
  );
  const priorityRows = activeItems
    .map((item) => ({ item, priority: getHrEventPriority(item, notifications.preferences, now) }))
    .filter(({ priority }) => priority.rank >= 2)
    .sort((left, right) => sortHrPriorityRows(left, right));
  const attentionRows = priorityRows.slice(0, 4);
  const lowActivityItems = activeItems
    .filter((item) => item.type === "low_activity")
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
    .slice(0, 6);
  const trendItems = buildHrSevenDayTrend(activeItems, now);
  const maxTrendCount = Math.max(1, ...trendItems.map((item) => item.count));
  const courseRiskRows = buildHrCourseRiskRows(courseAnalytics.rows).slice(0, 5);
  const notStartedLearnersCount = courseAnalytics.rows.reduce((sum, row) => sum + row.notStartedLearnersCount, 0);
  const activeLearnersCount = Math.max(
    courseAnalytics.summary.assignedLearners -
      courseAnalytics.summary.completedLearners -
      courseAnalytics.summary.expiredAccessLearners,
    0
  );
  const completionRate = getPercent(
    courseAnalytics.summary.completedLearners,
    courseAnalytics.summary.assignedLearners
  );
  const courseRiskCount = courseRiskRows.filter((row) => row.score > 0).length;
  const maxMonthlyCompletions = Math.max(1, ...courseAnalytics.monthlyCompletions.map((item) => item.count));
  const feedQuickFilters = [
    {
      label: "Все",
      count: activeSummary.total,
      href: buildHrHomeHref(defaultFeedFilters, "hr-event-feed"),
      isActive:
        filters.status === "active" &&
        filters.eventType === "all" &&
        filters.priority === "all" &&
        !filters.courseId &&
        !filters.groupId,
    },
    {
      label: "Срочные",
      count: priorityRows.length,
      href: urgentEventsHref,
      isActive: filters.status === "active" && filters.priority === "urgent",
    },
    {
      label: "Истекает доступ",
      count: activeSummary.accessExpiring,
      href: buildHrHomeHref({ ...defaultFeedFilters, eventType: "access_expiring" }, "hr-event-feed"),
      isActive: filters.status === "active" && filters.eventType === "access_expiring" && filters.priority === "all",
    },
    {
      label: "Низкая активность",
      count: activeSummary.lowActivity,
      href: buildHrHomeHref({ ...defaultFeedFilters, eventType: "low_activity" }, "hr-event-feed"),
      isActive: filters.status === "active" && filters.eventType === "low_activity" && filters.priority === "all",
    },
    {
      label: "Завершения",
      count: activeSummary.completed,
      href: buildHrHomeHref({ ...defaultFeedFilters, eventType: "course_completed" }, "hr-event-feed"),
      isActive: filters.status === "active" && filters.eventType === "course_completed" && filters.priority === "all",
    },
    {
      label: "Обработанные",
      count: notifications.items.length - activeItems.length,
      href: buildHrHomeHref({ ...defaultFeedFilters, status: "processed" }, "hr-event-feed"),
      isActive: filters.status === "processed",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Главная HR</h1>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <HrMetricCard label="Активных событий" value={activeSummary.total} />
        <HrMetricCard label="Срочных сигналов" value={priorityRows.length} tone="rose" />
        <HrMetricCard label="Записано" value={courseAnalytics.summary.assignedLearners} tone="sky" />
        <HrMetricCard label="Завершили" value={courseAnalytics.summary.completedLearners} tone="emerald" />
        <HrMetricCard label="Средний прогресс" value={`${formatPercent(courseAnalytics.summary.avgProgressPercent)}%`} />
        <HrMetricCard label="Инвайты" value={courseAnalytics.summary.pendingInvites} tone="amber" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Сегодня требует внимания</h2>
            </div>
            <Link
              href={buildHrHomeHref(
                { ...filters, eventType: "access_expiring", priority: "all", status: "active" },
                "hr-event-feed"
              )}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              Только доступы
            </Link>
          </div>

          {priorityRows.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--ink-muted)]">
              Срочных событий сейчас нет. Можно спокойно смотреть общую ленту или отчеты, редкая роскошь.
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {attentionRows.map(({ item, priority }) => (
                  <Link
                    key={`attention:${item.notificationKey}`}
                    href={`/courses/${item.courseId}/learners/${item.learnerId}`}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--line)] hover:bg-white"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={priority} />
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[var(--ink)]">{getHrEventTitle(item, now)}</div>
                    <div className="mt-1 text-xs text-[var(--ink-muted)]">
                      {item.learnerName} · {item.courseTitle}
                    </div>
                  </Link>
                ))}
              </div>
              {priorityRows.length > attentionRows.length ? (
                <p className="mt-3 text-xs text-[var(--ink-muted)]">
                  Дополнительные срочные события в ленте ниже: {priorityRows.length - attentionRows.length}.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Быстрые действия</h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <HrQuickActionLink
              href={priorityRows.length ? urgentEventsHref : "/admin/reports/notifications"}
              label={priorityRows.length ? "Разобрать срочные события" : "Проверить правила уведомлений"}
              meta={priorityRows.length ? `${priorityRows.length} срочных в ленте` : "ленту можно настроить"}
              tone={priorityRows.length ? "rose" : "zinc"}
            />
            <HrQuickActionLink
              href="/courses?status=published&view=table"
              label="Назначения по курсам"
              meta={`${courseAnalytics.summary.publishedCourses} опубликованных`}
              tone="sky"
            />
            <HrQuickActionLink
              href="/admin/reports/learner-progress"
              label="Сводка по ученикам"
              meta={`${courseAnalytics.summary.assignedLearners} назначений`}
              tone="emerald"
            />
            <HrQuickActionLink
              href="/admin/users/new"
              label="Пригласить ученика"
              meta={
                courseAnalytics.summary.pendingInvites
                  ? `${courseAnalytics.summary.pendingInvites} ожидают ответа`
                  : "создание профиля"
              }
              tone="amber"
            />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Портфель опубликованных курсов</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Сводка по назначенным ученикам, завершениям, просроченным доступам и текущей активности.
            </p>
          </div>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
            {courseAnalytics.summary.publishedCourses} курсов
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HrPortfolioStat
            label="Активно учатся"
            value={activeLearnersCount}
            detail={`${completionRate}% завершили`}
            tone="sky"
          />
          <HrPortfolioStat
            label="Не начали"
            value={notStartedLearnersCount}
            detail="нужен первый контакт"
            tone="amber"
          />
          <HrPortfolioStat
            label="Истек доступ"
            value={courseAnalytics.summary.expiredAccessLearners}
            detail="проверьте продление"
            tone="rose"
          />
          <HrPortfolioStat
            label="Курсы с риском"
            value={courseRiskCount}
            detail="по текущей сводке"
            tone="zinc"
          />
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Завершения по месяцам</h3>
            <Link href="/analytics?tab=courses" className="text-xs font-medium text-[var(--info)] hover:underline">
              Подробная аналитика
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {courseAnalytics.monthlyCompletions.map((bucket) => {
              const height = Math.max(10, Math.round((bucket.count / maxMonthlyCompletions) * 100));

              return (
                <div key={bucket.monthKey} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase text-[var(--ink-muted)]">{bucket.label}</span>
                    <span className="text-sm font-semibold text-[var(--ink)]">{bucket.count}</span>
                  </div>
                  <div className="mt-3 flex h-20 items-end rounded-lg bg-white px-2 py-2">
                    <div className="w-full rounded-t-md bg-[var(--info)]" style={{ height: `${height}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Курсы с рисками</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Первые в очереди курсы: просроченный доступ, много учеников без старта, низкий прогресс или зависшие
              приглашения.
            </p>
          </div>
          <Link
            href="/analytics?tab=courses"
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            Все курсы
          </Link>
        </div>

        {courseRiskRows.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--ink-muted)]">
            В опубликованных курсах пока нет назначений, по которым можно собрать риск-сводку.
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-3 md:hidden">
              {courseRiskRows.map(({ row, tone }) => (
                <article key={`mobile-risk:${row.id}`} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/courses/${row.id}/learners`}
                        className="text-sm font-semibold text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                      >
                        {row.title}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">{row.groupName}</p>
                    </div>
                    <HrRiskBadge tone={tone} />
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-[var(--ink-muted)]">Записано</dt>
                      <dd className="mt-1 font-semibold text-[var(--ink)]">{row.assignedLearnersCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--ink-muted)]">Завершили</dt>
                      <dd className="mt-1 font-semibold text-[var(--ink)]">
                        {row.completedLearnersCount} ({formatPercent(row.completedLearnersPercent)}%)
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--ink-muted)]">Не начали</dt>
                      <dd className="mt-1 font-semibold text-[var(--ink)]">{row.notStartedLearnersCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--ink-muted)]">Истек доступ</dt>
                      <dd className="mt-1 font-semibold text-[var(--ink)]">{row.expiredAccessLearnersCount}</dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                      <span>Средний прогресс</span>
                      <span className="font-semibold text-[var(--ink)]">{formatPercent(row.avgProgressPercent)}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white">
                      <div
                        className="h-2 rounded-full bg-[var(--info)]"
                        style={{ width: `${Math.max(0, Math.min(row.avgProgressPercent, 100))}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/courses/${row.id}/learners?access=active`}
                      className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    >
                      Ученики
                    </Link>
                    <Link
                      href={`/courses/${row.id}/results`}
                      className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    >
                      Результаты
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 hidden overflow-hidden rounded-xl border border-[var(--line)] md:block">
              <div className="w-full overflow-x-auto">
                <table className="min-w-[920px] text-left text-sm">
                <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Курс</th>
                    <th className="px-4 py-3 font-medium">Записано</th>
                    <th className="px-4 py-3 font-medium">Завершили</th>
                    <th className="px-4 py-3 font-medium">Не начали</th>
                    <th className="px-4 py-3 font-medium">Истек доступ</th>
                    <th className="px-4 py-3 font-medium">Средний прогресс</th>
                    <th className="px-4 py-3 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {courseRiskRows.map(({ row, tone }) => (
                    <tr key={row.id} className="border-t border-[var(--line)] align-top text-[var(--ink)]">
                      <td className="px-4 py-4">
                        <Link
                          href={`/courses/${row.id}/learners`}
                          className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                        >
                          {row.title}
                        </Link>
                        <div className="mt-1 max-w-md truncate text-xs text-[var(--ink-muted)]">{row.groupName}</div>
                      </td>
                      <td className="px-4 py-4 font-medium text-[var(--ink)]">{row.assignedLearnersCount}</td>
                      <td className="px-4 py-4">
                        {row.completedLearnersCount} ({formatPercent(row.completedLearnersPercent)}%)
                      </td>
                      <td className="px-4 py-4">{row.notStartedLearnersCount}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            row.expiredAccessLearnersCount > 0
                              ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                              : "bg-[var(--surface)] text-[var(--ink-muted)]"
                          }`}
                        >
                          {row.expiredAccessLearnersCount}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="min-w-28">
                          <div className="flex items-center justify-between gap-2">
                            <span>{formatPercent(row.avgProgressPercent)}%</span>
                            <HrRiskBadge tone={tone} />
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-[var(--surface)]">
                            <div
                              className="h-2 rounded-full bg-[var(--info)]"
                              style={{ width: `${Math.max(0, Math.min(row.avgProgressPercent, 100))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/courses/${row.id}/learners?access=active`}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                          >
                            Ученики
                          </Link>
                          <Link
                            href={`/courses/${row.id}/results`}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                          >
                            Результаты
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ink)]">HR-уведомления</h2>
                <p className="mt-2 text-sm text-[var(--ink-muted)]">
                  Правила ленты и email-рассылки. В ежедневной работе они не мешают, но всегда рядом.
                </p>
              </div>
              <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
                {activeSummary.total}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <HrRuleRow enabled={notifications.preferences.notifyCourseCompleted} label="Завершение курса" />
              <HrRuleRow
                enabled={notifications.preferences.notifyLowActivity}
                label={`Низкая активность: ${notifications.preferences.lowActivityDays} дн.`}
              />
              <HrRuleRow
                enabled={notifications.preferences.notifyAccessExpiring}
                label={`Доступ истекает: ${notifications.preferences.accessExpiringDays} дн.`}
              />
            </div>

            <Link
              href="/admin/reports/notifications"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              Настроить правила
            </Link>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Низкая активность</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">Ученики с самым долгим перерывом в курсах.</p>

            {lowActivityItems.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink-muted)]">
                Нет учеников с низкой активностью.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {lowActivityItems.map((item) => (
                  <Link
                    key={`low:${item.notificationKey}`}
                    href={`/courses/${item.courseId}/learners/${item.learnerId}`}
                    className="block rounded-xl border border-[var(--line)] px-3 py-3 hover:bg-[var(--accent-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[var(--ink)]">{item.learnerName}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-muted)]">{item.courseTitle}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-medium text-[var(--warning)]">
                        {getDaysSince(item.occurredAt, now)} дн.
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Динамика 7 дней</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">Сколько событий появлялось по датам.</p>
            <div className="mt-5 flex h-32 items-end gap-2">
              {trendItems.map((item) => {
                const height = Math.max(8, Math.round((item.count / maxTrendCount) * 100));
                return (
                  <div key={item.key} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-24 w-full items-end rounded-full bg-[var(--surface)]">
                      <div
                        className="w-full rounded-full bg-[var(--accent)]"
                        style={{ height: `${height}%` }}
                        title={`${item.label}: ${item.count}`}
                      />
                    </div>
                    <div className="text-[11px] text-[var(--ink-muted)]">{item.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <div
          id="hr-event-feed"
          className="hr-target-panel scroll-mt-24 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--ink)]">Лента событий</h2>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Фильтруйте по типу, курсу и группе. Из карточки можно сразу перейти к ученику, курсу или скрыть обработанное.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[var(--success-soft)] px-3 py-1 font-medium text-[var(--success)]">
                Завершения: {activeSummary.completed}
              </span>
              <span className="rounded-full bg-[var(--warning-soft)] px-3 py-1 font-medium text-[var(--warning)]">
                Низкая активность: {activeSummary.lowActivity}
              </span>
              <span className="rounded-full bg-[var(--info-soft)] px-3 py-1 font-medium text-[var(--info)]">
                Доступ: {activeSummary.accessExpiring}
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {feedQuickFilters.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium ${
                  item.isActive
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    item.isActive ? "bg-white/15 text-white" : "bg-[var(--surface)] text-[var(--ink-muted)]"
                  }`}
                >
                  {item.count}
                </span>
              </Link>
            ))}
          </div>

          <form action="/#hr-event-feed" className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_150px_auto]">
            {filters.priority === "urgent" ? <input type="hidden" name="priority" value="urgent" /> : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Тип события</span>
              <Select
                name="eventType"
                defaultValue={filters.eventType}
                className="w-full"
              >
                <option value="all">Все события</option>
                <option value="course_completed">Завершения</option>
                <option value="low_activity">Низкая активность</option>
                <option value="access_expiring">Истекает доступ</option>
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Курс</span>
              <Select
                name="courseId"
                defaultValue={filters.courseId}
                className="w-full"
              >
                <option value="">Все курсы</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Группа</span>
              <Select
                name="groupId"
                defaultValue={filters.groupId}
                className="w-full"
              >
                <option value="">Все группы</option>
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group._count.memberships})
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Статус</span>
              <Select
                name="status"
                defaultValue={filters.status}
                className="w-full"
              >
                <option value="active">Активные</option>
                <option value="processed">Обработанные</option>
                <option value="all">Все</option>
              </Select>
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                Показать
              </button>
              <Link
                href={buildHrHomeHref(defaultFeedFilters, "hr-event-feed")}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                Сброс
              </Link>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
            <span className="rounded-full bg-[var(--surface)] px-3 py-1">Найдено: {filteredItems.length}</span>
            {filters.priority === "urgent" ? (
              <span className="rounded-full bg-[var(--danger-soft)] px-3 py-1 text-[var(--danger)]">Срочные</span>
            ) : null}
            {selectedCourse ? <span className="rounded-full bg-[var(--info-soft)] px-3 py-1 text-[var(--info)]">{selectedCourse.title}</span> : null}
            {selectedGroup ? <span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-[var(--success)]">{selectedGroup.name}</span> : null}
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
              По выбранным фильтрам событий нет.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {filteredItems.slice(0, 30).map((item) => {
                const priority = getHrEventPriority(item, notifications.preferences, now);
                return (
                  <article
                    key={item.notificationKey}
                    className={`rounded-2xl border px-4 py-4 transition ${
                      item.isDismissed
                        ? "border-[var(--line)] bg-[var(--surface)] opacity-80"
                        : "border-[var(--line)] bg-white hover:border-[var(--line)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <HrNotificationBadge type={item.type} />
                          <PriorityBadge priority={priority} />
                          {item.isDismissed ? (
                            <span className="rounded-full bg-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
                              Обработано
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-[var(--ink)]">{getHrEventTitle(item, now)}</h3>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                          {getHrEventDescription(item, notifications.preferences)}
                        </p>
                      </div>
                      <div className="text-xs text-[var(--ink-muted)]">{formatDateTimeRu(item.occurredAt)}</div>
                    </div>

                    <dl className="mt-4 grid gap-3 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-[var(--ink-muted)]">Ученик</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">
                          {item.learnerName} <span className="text-[var(--ink-muted)]">({item.learnerLogin})</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[var(--ink-muted)]">Курс</dt>
                        <dd className="mt-1 font-medium text-[var(--ink)]">{item.courseTitle}</dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/courses/${item.courseId}/learners/${item.learnerId}`}
                        className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
                      >
                        Открыть ученика
                      </Link>
                      <Link
                        href={`/courses/${item.courseId}/learners?q=${encodeURIComponent(item.learnerLogin)}`}
                        className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                      >
                        Открыть курс
                      </Link>
                      {item.type === "access_expiring" ? (
                        <Link
                          href={`/courses/${item.courseId}/learners/${item.learnerId}`}
                          className="rounded-xl border border-[var(--info)] bg-[var(--info-soft)] px-3 py-2 text-sm font-medium text-[var(--info)] hover:bg-[var(--info-soft)]"
                        >
                          Продлить доступ
                        </Link>
                      ) : null}
                      {item.isDismissed ? (
                        <form action={restoreHrNotification}>
                          <input type="hidden" name="notificationKey" value={item.notificationKey} />
                          <input type="hidden" name="returnTo" value={currentReturnTo} />
                          <button
                            type="submit"
                            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                          >
                            Вернуть в ленту
                          </button>
                        </form>
                      ) : (
                        <form action={dismissHrNotification}>
                          <input type="hidden" name="notificationKey" value={item.notificationKey} />
                          <input type="hidden" name="type" value={item.type} />
                          <input type="hidden" name="courseId" value={item.courseId} />
                          <input type="hidden" name="learnerId" value={item.learnerId} />
                          <input type="hidden" name="returnTo" value={currentReturnTo} />
                          <button
                            type="submit"
                            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                          >
                            Скрыть
                          </button>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function normalizeHrHomeFilters(searchParams: HrHomeSearchParams): HrHomeFilters {
  return {
    eventType: getHrEventFilter(searchParams.eventType),
    courseId: searchParams.courseId ?? "",
    groupId: searchParams.groupId ?? "",
    status: getHrStatusFilter(searchParams.status),
    priority: searchParams.priority === "urgent" ? "urgent" : "all",
  };
}

function getDefaultHrHomeFilters(): HrHomeFilters {
  return {
    eventType: "all",
    courseId: "",
    groupId: "",
    status: "active",
    priority: "all",
  };
}

function getHrEventFilter(value: string | undefined): HrNotificationType | "all" {
  if (value === "course_completed" || value === "low_activity" || value === "access_expiring") return value;
  return "all";
}

function getHrStatusFilter(value: string | undefined): HrHomeFilters["status"] {
  if (value === "processed" || value === "all") return value;
  return "active";
}

function buildHrHomeHref(filters: HrHomeFilters, fragment?: string) {
  const params = new URLSearchParams();
  if (filters.priority === "urgent") params.set("priority", filters.priority);
  if (filters.eventType !== "all") params.set("eventType", filters.eventType);
  if (filters.courseId) params.set("courseId", filters.courseId);
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.status !== "active") params.set("status", filters.status);
  const query = params.toString();
  const hash = fragment ? `#${fragment}` : "";
  return query ? `/?${query}${hash}` : `/${hash}`;
}

function filterHrItems(
  items: HrNotificationItem[],
  filters: HrHomeFilters,
  selectedGroupLearnerIds: Set<string>,
  preferences: { lowActivityDays: number },
  now: Date
) {
  return items.filter((item) => {
    if (filters.status === "active" && item.isDismissed) return false;
    if (filters.status === "processed" && !item.isDismissed) return false;
    if (filters.priority === "urgent" && getHrEventPriority(item, preferences, now).rank < 2) return false;
    if (filters.eventType !== "all" && item.type !== filters.eventType) return false;
    if (filters.courseId && item.courseId !== filters.courseId) return false;
    if (filters.groupId && !selectedGroupLearnerIds.has(item.learnerId)) return false;
    return true;
  });
}

function summarizeHrItems(items: HrNotificationItem[]) {
  return {
    total: items.length,
    completed: items.filter((item) => item.type === "course_completed").length,
    lowActivity: items.filter((item) => item.type === "low_activity").length,
    accessExpiring: items.filter((item) => item.type === "access_expiring").length,
  };
}

type HrTone = "zinc" | "emerald" | "amber" | "sky" | "rose";

type HrCourseRiskRow = {
  row: HrCourseSummaryRow;
  score: number;
  tone: HrTone;
};

function buildHrCourseRiskRows(rows: HrCourseSummaryRow[]): HrCourseRiskRow[] {
  return rows
    .map((row) => {
      const lowProgressRisk =
        row.assignedLearnersCount > 0 && row.avgProgressPercent < 35 && row.completedLearnersPercent < 25;
      const score =
        row.expiredAccessLearnersCount * 5 +
        row.notStartedLearnersCount * 2 +
        row.pendingInvitesCount +
        (lowProgressRisk ? 3 : 0);
      const tone: HrTone =
        score >= 8 || row.expiredAccessLearnersCount > 0
          ? "rose"
          : score >= 3
            ? "amber"
            : row.assignedLearnersCount > 0
              ? "sky"
              : "zinc";

      return { row, score, tone };
    })
    .filter(({ row }) => row.assignedLearnersCount > 0 || row.pendingInvitesCount > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.row.avgProgressPercent !== right.row.avgProgressPercent) {
        return left.row.avgProgressPercent - right.row.avgProgressPercent;
      }
      return right.row.updatedAt.getTime() - left.row.updatedAt.getTime();
    });
}

type HrEventPriority = {
  rank: number;
  label: string;
  tone: HrTone;
};

function getHrEventPriority(
  item: HrNotificationItem,
  preferences: { lowActivityDays: number },
  now: Date
): HrEventPriority {
  if (item.type === "access_expiring") {
    const days = getDaysUntil(item.occurredAt, now);
    if (days <= 1) return { rank: 3, label: "Критично", tone: "rose" };
    if (days <= 3) return { rank: 2, label: "Высокий риск", tone: "amber" };
    return { rank: 1, label: "Планово", tone: "sky" };
  }

  if (item.type === "low_activity") {
    const days = getDaysSince(item.occurredAt, now);
    if (days >= preferences.lowActivityDays * 2) return { rank: 2, label: "Высокий риск", tone: "amber" };
    return { rank: 1, label: "Контроль", tone: "amber" };
  }

  return { rank: 0, label: "Инфо", tone: "emerald" };
}

function sortHrPriorityRows(
  left: { item: HrNotificationItem; priority: HrEventPriority },
  right: { item: HrNotificationItem; priority: HrEventPriority }
) {
  if (left.priority.rank !== right.priority.rank) return right.priority.rank - left.priority.rank;
  if (left.item.type === "low_activity" && right.item.type === "low_activity") {
    return left.item.occurredAt.getTime() - right.item.occurredAt.getTime();
  }
  return left.item.occurredAt.getTime() - right.item.occurredAt.getTime();
}

function getHrEventTitle(item: HrNotificationItem, now: Date) {
  if (item.type === "course_completed") return `${item.learnerName} завершил курс`;
  if (item.type === "access_expiring") {
    const days = getDaysUntil(item.occurredAt, now);
    if (days <= 1) return `${item.learnerName}: доступ истекает сегодня`;
    return `${item.learnerName}: доступ истекает через ${formatDaysRu(days)}`;
  }
  return `${item.learnerName}: нет активности ${formatDaysRu(getDaysSince(item.occurredAt, now))}`;
}

function getHrEventDescription(
  item: HrNotificationItem,
  preferences: { lowActivityDays: number; accessExpiringDays: number }
) {
  if (item.type === "course_completed") {
    return `Курс «${item.courseTitle}» завершен. Можно открыть карточку ученика, проверить результат и использовать данные в отчете.`;
  }

  if (item.type === "access_expiring") {
    return `Курс «${item.courseTitle}»: доступ закончится ${formatDateRu(item.occurredAt)}. Правило предупреждает за ${formatDaysRu(preferences.accessExpiringDays)}.`;
  }

  return `Курс «${item.courseTitle}»: последняя активность была ${formatDateRu(item.occurredAt)}. Порог уведомления: ${formatDaysRu(preferences.lowActivityDays)}.`;
}

function getDaysSince(value: Date, now: Date) {
  return Math.max(0, Math.floor((startOfDay(now).getTime() - startOfDay(value).getTime()) / DAY_MS));
}

function getDaysUntil(value: Date, now: Date) {
  return Math.max(0, Math.ceil((startOfDay(value).getTime() - startOfDay(now).getTime()) / DAY_MS));
}

function buildHrSevenDayTrend(items: HrNotificationItem[], now: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = startOfDay(new Date(now));
    date.setDate(date.getDate() - 6 + index);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const count = items.filter((item) => item.occurredAt >= date && item.occurredAt < nextDate).length;
    return {
      key: date.toISOString(),
      label: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date),
      count,
    };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDaysRu(value: number) {
  const normalized = Math.abs(value);
  const lastTwo = normalized % 100;
  const last = normalized % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} дней`;
  if (last === 1) return `${value} день`;
  if (last >= 2 && last <= 4) return `${value} дня`;
  return `${value} дней`;
}

function getPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function HrRuleRow({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2">
      <span className="text-[var(--ink)]">{label}</span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          enabled ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface)] text-[var(--ink-muted)]"
        }`}
      >
        {enabled ? "Вкл" : "Выкл"}
      </span>
    </div>
  );
}

function HrPortfolioStat({
  label,
  value,
  detail,
  tone = "zinc",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: HrTone;
}) {
  const toneClassName = getHrToneClassName(tone, "soft");

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--ink-muted)]">{label}</span>
        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${toneClassName}`}>{detail}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
    </div>
  );
}

function HrQuickActionLink({
  href,
  label,
  meta,
  tone = "zinc",
}: {
  href: string;
  label: string;
  meta: string;
  tone?: HrTone;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--line)] hover:bg-white"
    >
      <span>
        <span className="block text-sm font-semibold text-[var(--ink)]">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{meta}</span>
      </span>
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${getHrToneClassName(
          tone,
          "strong"
        )}`}
        aria-hidden="true"
      >
        →
      </span>
    </Link>
  );
}

function HrRiskBadge({ tone }: { tone: HrTone }) {
  const label = tone === "rose" ? "Высокий" : tone === "amber" ? "Контроль" : tone === "sky" ? "Норма" : "Нет";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getHrToneClassName(tone, "soft")}`}>
      {label}
    </span>
  );
}

function HrMetricCard({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: React.ReactNode;
  tone?: HrTone;
}) {
  const toneClassName = getHrToneClassName(tone, "soft");

  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}>{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">{value}</div>
    </div>
  );
}

function getHrToneClassName(tone: HrTone, intensity: "soft" | "strong") {
  if (intensity === "strong") {
    if (tone === "emerald") return "bg-[var(--accent)] text-white";
    if (tone === "amber") return "bg-[var(--warning)] text-white";
    if (tone === "sky") return "bg-[var(--info)] text-white";
    if (tone === "rose") return "bg-[var(--danger)] text-white";
    return "bg-[var(--accent)] text-white";
  }

  if (tone === "emerald") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (tone === "amber") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  if (tone === "sky") return "bg-[var(--info-soft)] text-[var(--info)]";
  if (tone === "rose") return "bg-[var(--danger-soft)] text-[var(--danger)]";
  return "bg-[var(--surface)] text-[var(--ink)]";
}

function PriorityBadge({ priority }: { priority: HrEventPriority }) {
  const className =
    priority.tone === "rose"
      ? "bg-[var(--danger-soft)] text-[var(--danger)]"
      : priority.tone === "amber"
        ? "bg-[var(--warning-soft)] text-[var(--warning)]"
        : priority.tone === "sky"
          ? "bg-[var(--info-soft)] text-[var(--info)]"
          : priority.tone === "emerald"
            ? "bg-[var(--success-soft)] text-[var(--success)]"
            : "bg-[var(--surface)] text-[var(--ink)]";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{priority.label}</span>;
}

function HrNotificationBadge({ type }: { type: HrNotificationType }) {
  if (type === "course_completed") {
    return (
      <span className="rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-medium text-[var(--success)]">
        Завершение
      </span>
    );
  }

  if (type === "access_expiring") {
    return (
      <span className="rounded-full bg-[var(--info-soft)] px-2.5 py-1 text-xs font-medium text-[var(--info)]">
        Скоро истекает доступ
      </span>
    );
  }

  return (
    <span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-medium text-[var(--warning)]">
      Низкая активность
    </span>
  );
}

