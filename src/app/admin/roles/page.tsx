import Link from "next/link";
import type { ReactNode } from "react";
import { deleteRoleProfile } from "@/app/actions/role-actions";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { SystemRoleMarker } from "@/components/SystemRoleMarker";
import { Button, buttonStyles, TD, TH, THead, TR, Table } from "@/components/ui";
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
    <section className="mt-6 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-raised)] p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
        {action}
      </div>

      <Table className="min-w-full">
        <THead>
          <TR>
            <TH>Роль</TH>
            <TH>Описание</TH>
            <TH>Пользователей</TH>
            <TH>Доступов</TH>
            <TH className="text-right">Действия</TH>
          </TR>
        </THead>
        <tbody>
          {roles.length === 0 ? (
            <TR>
              <TD colSpan={5} className="py-8 text-center text-[var(--ink-muted)]">
                Роли в этом разделе пока отсутствуют.
              </TD>
            </TR>
          ) : (
            roles.map((role) => {
              const permissions = parsePermissionsJson(role.permissionsJson);
              const permissionsCount = permissions.length;
              const roleDescription = ROLE_DESCRIPTIONS[role.name] ?? "Пользовательская роль.";
              const usersCount = role.usersCount;

              return (
                <TR key={role.id}>
                  <TD className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{role.name}</span>
                      {role.isSystem ? <SystemRoleMarker /> : null}
                    </span>
                  </TD>
                  <TD>{roleDescription}</TD>
                  <TD>{usersCount}</TD>
                  <TD>{permissionsCount}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/roles/${role.id}`}
                        className={buttonStyles("secondary", "sm")}
                      >
                        Настроить
                      </Link>
                      {!role.isSystem ? (
                        <form action={deleteRoleProfile.bind(null, role.id)}>
                          <Button type="submit" variant="danger" size="sm">
                            Удалить
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              );
            })
          )}
        </tbody>
      </Table>
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
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Настройка ролей, групп доступов и прав пользователей.
      </p>
      <AdminUsersSubtabs active="roles" />

      <RoleTable
        title="Роли"
        description="Системные роли отмечены замком. Пользовательские роли можно создавать и удалять."
        roles={roles}
        action={
          <Link href="/admin/roles/new" className={buttonStyles("primary")}>
            Новая роль
          </Link>
        }
      />
    </main>
  );
}
