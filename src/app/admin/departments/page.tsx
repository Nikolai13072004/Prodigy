import { auth } from "@/auth";
import { createDepartment, deleteDepartment } from "@/app/actions/department-actions";
import { AdminCreateDepartmentModal } from "@/components/AdminCreateDepartmentModal";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { PERMISSIONS, hasPermission } from "@/lib/roles";

export default async function DepartmentsPage() {
  await requirePermission(PERMISSIONS.DEPARTMENTS_VIEW);
  const session = await auth();
  const canCreateEdit = hasPermission(
    session?.user?.role,
    PERMISSIONS.DEPARTMENTS_CREATE_EDIT,
    session?.user?.permissions
  );
  const canDelete = hasPermission(session?.user?.role, PERMISSIONS.DEPARTMENTS_DELETE, session?.user?.permissions);
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Управление пользователями</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Создание и настройка подразделений компании.</p>
      <AdminUsersSubtabs active="departments" />

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Подразделения</h2>
            <p className="mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Добавьте подразделения и назначайте обучение сразу целым отделам.
            </p>
          </div>
          {canCreateEdit && <AdminCreateDepartmentModal action={createDepartment} />}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-300">
                  Название подразделения
                </th>
                <th className="px-3 py-2 text-left font-semibold text-zinc-500 dark:text-zinc-300">
                  Всего пользователей
                </th>
                <th className="w-32 px-3 py-2 text-right font-semibold text-zinc-500 dark:text-zinc-300">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-800 dark:text-zinc-100">{department.name}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">0</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {canDelete && (
                        <form action={deleteDepartment.bind(null, department.id)}>
                          <button
                            type="submit"
                            className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            Удалить
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                    Подразделения пока не созданы.
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
