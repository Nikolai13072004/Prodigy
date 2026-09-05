import Link from "next/link";
import { UserCsvImportPanel } from "@/app/admin/users/import/UserCsvImportPanel";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { buttonStyles } from "@/components/ui";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

export default async function UserImportPage() {
  const session = await requirePermission(PERMISSIONS.USERS_CREATE);
  await ensureSystemRoleProfiles();
  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions
  );

  const [roles, groups, departments, organizations] = await Promise.all([
    prisma.roleProfile.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {canEditAccessLevel ? "Импорт пользователей" : "Импорт учеников"}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {canEditAccessLevel
              ? "Массовое создание пользователей через CSV с preview, проверкой строк и отчетом по результату."
              : "Массовое создание учеников через CSV с автоматической отправкой письма и временного пароля."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/users-groups?tab=users#users-section"
            className={buttonStyles("secondary")}
          >
            К списку пользователей
          </Link>
          <Link href="/admin/users/new" className={buttonStyles("primary")}>
            {canEditAccessLevel ? "Создать вручную" : "Создать ученика вручную"}
          </Link>
        </div>
      </div>

      <AdminUsersSubtabs />

      <UserCsvImportPanel
        canEditAccessLevel={canEditAccessLevel}
        roleNames={roles.map((role) => role.name)}
        groupNames={groups.map((group) => group.name)}
        departmentNames={departments.map((department) => department.name)}
        organizationNames={organizations.map((organization) => organization.name)}
      />
    </main>
  );
}
