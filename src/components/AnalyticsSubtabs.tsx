import { auth } from "@/auth";
import Link from "next/link";
import { getPermissionsForRoleNames } from "@/lib/role-profiles";
import { PERMISSIONS, type Permission, hasPermission, isPlatformAdminRole } from "@/lib/roles";

// Под-навигация раздела «Аналитика» (решение D каркаса): Отчёты, Внимание,
// Аналитика и История были четырьмя разрозненными пунктами меню — здесь они
// становятся единым разделом с переключением, по образцу AdminUsersSubtabs.
// «История» доступна только платформенному админу (не по permission).

type TabKey = "reports" | "attention" | "analytics" | "history";

type AnalyticsTab = {
  key: TabKey;
  label: string;
  href: string;
  requiredPermission?: Permission;
  platformAdminOnly?: boolean;
};

const TABS: AnalyticsTab[] = [
  { key: "reports", label: "Отчёты", href: "/admin/reports", requiredPermission: PERMISSIONS.REPORTS_VIEW },
  { key: "attention", label: "Внимание", href: "/admin/attention", requiredPermission: PERMISSIONS.REPORTS_VIEW },
  { key: "analytics", label: "Аналитика", href: "/analytics", requiredPermission: PERMISSIONS.REPORTS_VIEW },
  { key: "history", label: "История", href: "/history", platformAdminOnly: true },
];

export async function AnalyticsSubtabs({ active }: { active?: TabKey }) {
  const session = await auth();
  if (!session?.user) return null;

  const permissions = await getPermissionsForRoleNames(session.user.roles);
  const visibleTabs = TABS.filter((tab) => {
    if (tab.platformAdminOnly) return isPlatformAdminRole(session.user.roles);
    return !tab.requiredPermission || hasPermission(session.user.roles, tab.requiredPermission, permissions);
  });

  // Один доступный пункт — переключать не между чем.
  if (visibleTabs.length <= 1) return null;

  return (
    <nav className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]">
      <ul className="flex min-w-max">
        {visibleTabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key} className="border-r border-[var(--line)] last:border-r-0">
              <Link
                href={tab.href}
                className={`block px-5 py-3 text-sm ${
                  isActive
                    ? "bg-[var(--surface-raised)] font-semibold text-[var(--ink)] shadow-[inset_0_-3px_0_var(--ink)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
