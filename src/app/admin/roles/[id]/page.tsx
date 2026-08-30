import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteRoleProfile, updateRoleProfile } from "@/app/actions/role-actions";
import { RolePermissionsForm } from "@/app/admin/roles/RolePermissionsForm";
import { Button, buttonStyles } from "@/components/ui";
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
          <Link href="/admin/roles" className={buttonStyles("secondary", "sm")}>
            Назад
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Настройки роли</h1>
        </div>
        <div className="text-sm text-[var(--ink-muted)]">
          Пользователей с этой ролью: <strong>{assignedUsersCount}</strong>
        </div>
      </div>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
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
        <section className="mt-6 rounded-[var(--radius-panel)] border border-[var(--danger)] bg-[var(--danger-soft)] p-5">
          <h2 className="text-base font-semibold text-[var(--danger)]">Опасная зона</h2>
          <p className="mt-1 text-sm text-[var(--danger)]">
            Удаление роли возможно только если она не назначена пользователям.
          </p>
          <form action={deleteRoleProfile.bind(null, role.id)} className="mt-3">
            <Button type="submit" variant="danger">
              Удалить роль
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}
