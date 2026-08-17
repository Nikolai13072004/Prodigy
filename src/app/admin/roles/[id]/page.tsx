import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteRoleProfile, updateRoleProfile } from "@/app/actions/role-actions";
import { RolePermissionsForm } from "@/app/admin/roles/RolePermissionsForm";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { ensureSystemRoleProfiles, parsePermissionsJson } from "@/lib/role-profiles";
import { PERMISSIONS } from "@/lib/roles";

export default async function RoleSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  await ensureSystemRoleProfiles();
  const { id } = await params;

  const role = await prisma.roleProfile.findUnique({
    where: { id },
    select: { id: true, name: true, isSystem: true, permissionsJson: true },
  });
  if (!role) notFound();

  const assignedUsersCount = await prisma.user.count({
    where: {
      OR: [{ role: role.name }, { userRoles: { some: { roleProfileId: role.id } } }],
    },
  });

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/roles"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            Назад
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Настройки роли</h1>
        </div>
        <div className="text-sm text-zinc-500">
          Пользователей с этой ролью: <strong>{assignedUsersCount}</strong>
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Измените разрешения и сохраните настройки роли.
      </p>

      <div className="mt-6">
        <RolePermissionsForm
          action={updateRoleProfile.bind(null, role.id)}
          submitLabel="Сохранить изменения"
          defaultName={role.name}
          disableName={role.isSystem}
          selectedPermissions={parsePermissionsJson(role.permissionsJson)}
        />
      </div>

      {!role.isSystem && (
        <section className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40">
          <h2 className="text-base font-semibold text-red-700 dark:text-red-200">Опасная зона</h2>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-200/90">
            Удаление роли возможно только если она не назначена пользователям.
          </p>
          <form action={deleteRoleProfile.bind(null, role.id)} className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-100 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-900/50"
            >
              Удалить роль
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
