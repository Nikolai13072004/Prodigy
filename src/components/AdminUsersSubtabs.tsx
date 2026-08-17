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
    <nav className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
      <ul className="flex min-w-max">
        {visibleTabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li key={tab.key} className="border-r border-zinc-200 last:border-r-0 dark:border-zinc-800">
              <Link
                href={tab.href}
                className={`block px-5 py-3 text-sm ${
                  isActive
                    ? "bg-white font-semibold text-[#0f315d] shadow-[inset_0_-3px_0_#0f315d] dark:bg-zinc-900 dark:text-white dark:shadow-[inset_0_-3px_0_#f4f4f5]"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
