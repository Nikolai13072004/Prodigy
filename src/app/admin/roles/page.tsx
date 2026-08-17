import Link from "next/link";
import type { ReactNode } from "react";
import { deleteRoleProfile } from "@/app/actions/role-actions";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { SystemRoleMarker } from "@/components/SystemRoleMarker";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { ensureSystemRoleProfiles, parsePermissionsJson } from "@/lib/role-profiles";
import { PERMISSIONS, ROLE_DESCRIPTIONS } from "@/lib/roles";

type RoleListItem = {
  id: string;
  name: string;
  isSystem: boolean;
  permissionsJson: string;
  usersCount: number;
};

function RoleTable({
  action,
  title,
  description,
  roles,
}: {
  action?: ReactNode;
  title: string;
  description: string;
  roles: RoleListItem[];
}) {
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        </div>
        {action}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-200">Роль</th>
              <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-200">Описание</th>
              <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-200">Пользователей</th>
              <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-200">Доступов</th>
              <th className="px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-200">Действия</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                  Роли в этом разделе пока отсутствуют.
                </td>
              </tr>
            ) : (
              roles.map((role) => {
                const permissions = parsePermissionsJson(role.permissionsJson);
                const permissionsCount = permissions.length;
                const roleDescription = ROLE_DESCRIPTIONS[role.name] ?? "Пользовательская роль.";
                const usersCount = role.usersCount;

                return (
                  <tr key={role.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span>{role.name}</span>
                        {role.isSystem ? <SystemRoleMarker /> : null}
                      </span>
                    </td>
                    <td className="px-3 py-2">{roleDescription}</td>
                    <td className="px-3 py-2">{usersCount}</td>
                    <td className="px-3 py-2">{permissionsCount}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/roles/${role.id}`}
                          className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                        >
                          Настроить
                        </Link>
                        {!role.isSystem ? (
                          <form action={deleteRoleProfile.bind(null, role.id)}>
                            <button
                              type="submit"
                              className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                            >
                              Удалить
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function RolesPage() {
  await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  await ensureSystemRoleProfiles();

  const roleProfiles = await prisma.roleProfile.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  const userCounts = await Promise.all(
    roleProfiles.map((role) =>
      prisma.user.count({
        where: {
          OR: [{ role: role.name }, { userRoles: { some: { roleProfileId: role.id } } }],
        },
      })
    )
  );
  const roles = roleProfiles.map((role, index) => ({
    ...role,
    usersCount: userCounts[index] ?? 0,
  }));

  return (
    <main className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Управление пользователями</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Настройка ролей, групп доступов и прав пользователей.
      </p>
      <AdminUsersSubtabs active="roles" />

      <RoleTable
        title="Роли"
        description="Системные роли отмечены замком. Пользовательские роли можно создавать и удалять."
        roles={roles}
        action={
          <Link
            href="/admin/roles/new"
            className="rounded-md bg-[#2dbf6e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#27a860]"
          >
            Новая роль
          </Link>
        }
      />
    </main>
  );
}
