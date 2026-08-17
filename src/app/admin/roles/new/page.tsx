import Link from "next/link";
import { createRoleProfile } from "@/app/actions/role-actions";
import { RolePermissionsForm } from "@/app/admin/roles/RolePermissionsForm";
import { requirePermission } from "@/lib/auth-guards";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { PERMISSIONS } from "@/lib/roles";

export default async function NewRolePage() {
  await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  await ensureSystemRoleProfiles();

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/roles"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Назад
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Новая роль</h1>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Создайте роль и выберите разрешения доступа по группам.
      </p>

      <div className="mt-6">
        <RolePermissionsForm action={createRoleProfile} submitLabel="Создать роль" />
      </div>
    </main>
  );
}
