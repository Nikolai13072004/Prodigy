import { auth } from "@/auth";
import Link from "next/link";
import { getPermissionsForRoleNames } from "@/lib/role-profiles";
import { PERMISSIONS, type Permission, hasPermission } from "@/lib/roles";

type TabKey = "users" | "roles" | "departments" | "organizations" | "groups";

const TABS: Array<{ key: TabKey; label: string; href: string; requiredPermission: Permission }> = [
  { key: "users", label: "Пользователи", href: "/admin/users-groups?tab=users", requiredPermission: PERMISSIONS.USERS_VIEW },
  {
    key: "roles",
    label: "Роли",
    href: "/admin/roles",
    requiredPermission: PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
  },
  {
    key: "departments",
    label: "Подразделения",
    href: "/admin/departments",
    requiredPermission: PERMISSIONS.DEPARTMENTS_VIEW,
  },
  {
    key: "organizations",
    label: "Организации",
    href: "/admin/organizations",
    requiredPermission: PERMISSIONS.ORGANIZATIONS_VIEW,
  },
  { key: "groups", label: "Группы", href: "/admin/users-groups?tab=groups", requiredPermission: PERMISSIONS.GROUPS_VIEW },
];

export async function AdminUsersSubtabs({ active }: { active?: TabKey }) {
  const session = await auth();
  if (!session?.user) return null;

  const permissions = await getPermissionsForRoleNames(session.user.roles);
  const visibleTabs = TABS.filter((tab) => hasPermission(session.user.roles, tab.requiredPermission, permissions));

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
