import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guards";
import {
  getHrCourseAnalyticsData,
  getHrCourseAnalyticsStatusFilter,
} from "@/lib/hr-course-analytics";
import { AnalyticsSubtabs } from "@/components/AnalyticsSubtabs";
import { PERMISSIONS, hasPermission, isPlatformAdminRole } from "@/lib/roles";
import {
  loadAdminCoursesData,
  loadAdminOverviewData,
  loadHrFeedbackFeed,
  loadUserStatsData,
} from "./_analytics/data";
import { buildHrAnalyticsHref } from "./_analytics/hrefs";
import {
  AdminCoursesSection,
  AdminOverviewSection,
  HrCoursesSection,
  TabLink,
  UserStatsSection,
} from "./_analytics/sections";

type Props = {
  searchParams: Promise<{ tab?: string; q?: string; status?: string }>;
};

type AdminTab = "overview" | "courses";
type HrTab = "courses";
type UserTab = "my";
type AnalyticsMode = "admin" | "hr" | "user";

export default async function AnalyticsPage({ searchParams }: Props) {
  const session = await requireSession();
  const canViewReports = hasPermission(
    session.user.roles,
    PERMISSIONS.REPORTS_VIEW,
    session.user.permissions
  );
  if (!canViewReports) redirect("/");

  const isAdmin = isPlatformAdminRole(session.user.roles);
  const canManageAssignments = hasPermission(
    session.user.roles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    session.user.permissions
  );
  const canViewUsers = hasPermission(session.user.roles, PERMISSIONS.USERS_VIEW, session.user.permissions);
  const sp = await searchParams;
  const mode: AnalyticsMode = isAdmin ? "admin" : canManageAssignments || canViewUsers ? "hr" : "user";

  const tab = resolveTab(sp.tab, mode);

  const adminOverviewData = isAdmin && tab === "overview" ? await loadAdminOverviewData() : null;
  const adminCoursesData = isAdmin && tab === "courses" ? await loadAdminCoursesData() : null;
  const hrCoursesData =
    mode === "hr" && tab === "courses"
      ? await getHrCourseAnalyticsData({
          q: sp.q ?? "",
          statusFilter: getHrCourseAnalyticsStatusFilter(sp.status),
        })
      : null;
  const hrFeedbackFeed =
    mode === "hr" && hrCoursesData
      ? await loadHrFeedbackFeed(hrCoursesData.rows.map((row) => row.id))
      : [];
  const userStatsData = mode === "user" ? await loadUserStatsData(session.user.id) : null;

  return (
    <main className="mx-auto max-w-7xl pb-8">
      <div className="rounded-2xl border border-[var(--line)] bg-white px-6 py-5 shadow-[0_8px_20px_rgba(18,40,70,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Аналитика</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {mode === "admin"
                ? "Обзор KPI и ключевых сценариев обучения в формате MVP."
                : mode === "hr"
                  ? "Сводка по курсам для HR: сколько учеников обучается, завершило курс, каков средний прогресс и где уже истек доступ."
                  : "Личная статистика по назначенным курсам и результатам проверок знаний."}
            </p>
          </div>
          <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
            {mode === "admin" ? "BI Dashboard" : mode === "hr" ? "HR Dashboard" : "Progress"}
          </span>
        </div>
      </div>

      <AnalyticsSubtabs active="analytics" />

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2">
        <nav className="flex flex-wrap gap-2 px-1 py-1">
          {mode === "admin" ? (
            <>
              <TabLink href="/analytics?tab=overview" active={tab === "overview"} label="Обзор" />
              <TabLink href="/analytics?tab=courses" active={tab === "courses"} label="По курсам" />
            </>
          ) : mode === "hr" ? (
            <TabLink href={buildHrAnalyticsHref({})} active={tab === "courses"} label="Сводка по курсам" />
          ) : (
            <TabLink href="/analytics?tab=my" active={tab === "my"} label="Моя статистика" />
          )}
        </nav>
      </section>

      {isAdmin && tab === "overview" && adminOverviewData && (
        <AdminOverviewSection data={adminOverviewData} />
      )}
      {isAdmin && tab === "courses" && adminCoursesData && (
        <AdminCoursesSection rows={adminCoursesData} />
      )}
      {mode === "hr" && hrCoursesData && (
        <HrCoursesSection
          rows={hrCoursesData.rows}
          summary={hrCoursesData.summary}
          monthlyCompletions={hrCoursesData.monthlyCompletions}
          feedbackFeed={hrFeedbackFeed}
          q={sp.q ?? ""}
          statusFilter={getHrCourseAnalyticsStatusFilter(sp.status)}
        />
      )}
      {mode === "user" && userStatsData && <UserStatsSection data={userStatsData} />}
    </main>
  );
}

function resolveTab(value: string | undefined, mode: AnalyticsMode): AdminTab | HrTab | UserTab {
  if (mode === "user") return "my";
  if (mode === "hr") return "courses";
  if (value === "courses") return "courses";
  return "overview";
}
