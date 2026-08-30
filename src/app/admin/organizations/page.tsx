import { auth } from "@/auth";
import { createOrganization, deleteOrganization } from "@/app/actions/organization-actions";
import { AdminCreateOrganizationModal } from "@/components/AdminCreateOrganizationModal";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { Button } from "@/components/ui";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

export default async function OrganizationsPage() {
  await requirePermission(PERMISSIONS.ORGANIZATIONS_VIEW);
  const session = await auth();
  const canCreateEdit = hasPermission(
    session?.user?.role,
    PERMISSIONS.ORGANIZATIONS_CREATE_EDIT,
    session?.user?.permissions
  );
  const canDelete = hasPermission(
    session?.user?.role,
    PERMISSIONS.ORGANIZATIONS_DELETE,
    session?.user?.permissions
  );
  const organizations = await prisma.organization.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Управление пользователями</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">Создание и настройка организаций.</p>
      <AdminUsersSubtabs active="organizations" />

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Организации</h2>
            <p className="mt-2 max-w-md text-sm text-[var(--ink-muted)]">
              Добавьте организации, чтобы использовать их в разграничении доступа и назначений.
            </p>
          </div>
          {canCreateEdit && <AdminCreateOrganizationModal action={createOrganization} />}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="px-3 py-2 text-left font-semibold text-[var(--ink-muted)]">
                  Название организации
                </th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--ink-muted)]">
                  Всего пользователей
                </th>
                <th className="w-32 px-3 py-2 text-right font-semibold text-[var(--ink-muted)]">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((organization) => (
                <tr key={organization.id} className="border-b border-[var(--line)]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--ink)]">{organization.name}</div>
                  </td>
                  <td className="px-3 py-2 text-[var(--ink)]">0</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {canDelete && (
                        <form action={deleteOrganization.bind(null, organization.id)}>
                          <Button type="submit" variant="danger" size="sm">
                            Удалить
                          </Button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {organizations.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-[var(--ink-muted)]">
                    Организации пока не созданы.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
