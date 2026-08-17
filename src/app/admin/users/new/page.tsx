import Link from "next/link";
import { createUser } from "@/app/actions/user-actions";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { SystemRoleMarker } from "@/components/SystemRoleMarker";
import { requirePermission } from "@/lib/auth-guards";
import { buildPasswordPolicyHint, getPlatformSecuritySettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { PERMISSIONS, ROLE_LABELS, STANDARD_ROLE_NAMES, hasPermission } from "@/lib/roles";
import { USER_STATUSES, USER_STATUS_LABELS } from "@/lib/users";

type Props = {
  searchParams: Promise<{
    error?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    login?: string;
    email?: string;
    role?: string | string[];
    status?: string;
    groupId?: string;
    departmentId?: string;
    organizationId?: string;
    sendInvite?: string;
  }>;
};

function asSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function asMultiValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

export default async function NewUserPage({ searchParams }: Props) {
  const session = await requirePermission(PERMISSIONS.USERS_CREATE);
  await ensureSystemRoleProfiles();
  const sp = await searchParams;
  const error = asSingleValue(sp.error);
  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions
  );
  const legacyNameValue = asSingleValue(sp.name);
  const firstNameValue = asSingleValue(sp.firstName) || legacyNameValue;
  const lastNameValue = asSingleValue(sp.lastName);
  const loginValue = asSingleValue(sp.login);
  const emailValue = asSingleValue(sp.email);
  const statusValue = asSingleValue(sp.status) || USER_STATUSES.ACTIVE;
  const groupIdValue = asSingleValue(sp.groupId);
  const departmentIdValue = asSingleValue(sp.departmentId);
  const organizationIdValue = asSingleValue(sp.organizationId);
  const sendInviteValue = asSingleValue(sp.sendInvite);
  const sendInviteDefaultChecked = sendInviteValue !== "0";
  const selectedRoles = new Set(asMultiValue(sp.role));

  const [securitySettings, roles, groups, departments, organizations] = await Promise.all([
    getPlatformSecuritySettings(),
    prisma.roleProfile.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isSystem: true },
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
  const passwordHint = buildPasswordPolicyHint(securitySettings);

  return (
    <main className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {canEditAccessLevel ? "Управление пользователями" : "Управление учениками"}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {canEditAccessLevel
          ? "Создание нового пользователя."
          : "Создание нового ученика с возможностью сразу отправить письмо с временным паролем."}
      </p>
      <AdminUsersSubtabs active="users" />

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{canEditAccessLevel ? "Новый пользователь" : "Новый ученик"}</h2>
          <Link
            href="/admin/users-groups#users-section"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            Назад к списку
          </Link>
        </div>
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        ) : null}

        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="mr-1 text-red-600 dark:text-red-400" aria-hidden="true">*</span>
          Обязательные поля. Пароль обязателен при обычном создании без приглашения.
        </p>
        {!canEditAccessLevel ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            После сохранения система создаст ученика с ролью «Ученик». Письмо с временным паролем можно отправить сразу или позже.
          </div>
        ) : null}

        <form action={createUser} noValidate className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200"><span className="mr-1 text-red-600 dark:text-red-400" aria-hidden="true">*</span>Имя пользователя</span>
            <input
              name="firstName"
              required
              defaultValue={firstNameValue}
              autoComplete="given-name"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">Фамилия</span>
            <input
              name="lastName"
              defaultValue={lastNameValue}
              autoComplete="family-name"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200"><span className="mr-1 text-red-600 dark:text-red-400" aria-hidden="true">*</span>Логин</span>
            <input
              name="login"
              required
              defaultValue={loginValue}
              autoComplete="off"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200"><span className="mr-1 text-red-600 dark:text-red-400" aria-hidden="true">*</span>Email</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={emailValue}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          {canEditAccessLevel ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200"><span className="mr-1 text-red-600 dark:text-red-400" aria-hidden="true">*</span>Пароль</span>
                <input
                  name="password"
                  type="password"
                  minLength={securitySettings.passwordMinLength}
                  defaultValue=""
                  autoComplete="new-password"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {passwordHint}{" "}
                  Для обычного создания пароль обязателен. Если нажать «Создать и отправить приглашение», система создаст
                  пользователя в статусе «Ожидает подтверждения» и отправит письмо со ссылкой для активации, где пользователь
                  задаст пароль самостоятельно.
                </p>
              </label>

              <fieldset className="block md:col-span-2">
                <legend className="mb-2 block text-sm text-zinc-700 dark:text-zinc-200"><span className="mr-1 text-red-600 dark:text-red-400" aria-hidden="true">*</span>Роли</legend>
                <div className="grid gap-2 rounded-md border border-zinc-300 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="role"
                        value={role.name}
                        defaultChecked={selectedRoles.size > 0 ? selectedRoles.has(role.name) : role.name === STANDARD_ROLE_NAMES.STUDENT}
                      />
                      <span className="inline-flex items-center gap-1.5">
                        <span>{ROLE_LABELS[role.name] ?? role.name}</span>
                        {role.isSystem ? <SystemRoleMarker /> : null}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Можно выбрать несколько ролей. Первая выбранная роль станет основной для отображения.
                </p>
              </fieldset>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">Статус</span>
                <select
                  name="status"
                  defaultValue={statusValue}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value={USER_STATUSES.ACTIVE}>{USER_STATUS_LABELS[USER_STATUSES.ACTIVE]}</option>
                  <option value={USER_STATUSES.PENDING}>{USER_STATUS_LABELS[USER_STATUSES.PENDING]}</option>
                  <option value={USER_STATUSES.BLOCKED}>{USER_STATUS_LABELS[USER_STATUSES.BLOCKED]}</option>
                </select>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Статус «Ожидает подтверждения» автоматически сменится на «Активен» после первого успешного входа.
                </p>
              </label>
            </>
          ) : (
            <div className="rounded-md border border-zinc-300 px-3 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              Роль: <span className="font-medium">{ROLE_LABELS[STANDARD_ROLE_NAMES.STUDENT]}</span>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">Группа</span>
            <select
              name="groupId"
              defaultValue={groupIdValue}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Не выбрана</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">Подразделение</span>
            <select
              name="departmentId"
              defaultValue={departmentIdValue}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Не выбрано</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">Организация</span>
            <select
              name="organizationId"
              defaultValue={organizationIdValue}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Не выбрана</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          {!canEditAccessLevel ? (
            <label className="block md:col-span-2">
              <input type="hidden" name="sendInvite" value="0" />
              <span className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <input type="checkbox" name="sendInvite" value="1" defaultChecked={sendInviteDefaultChecked} />
                Отправить письмо с временным паролем сразу после создания
              </span>
            </label>
          ) : null}

          <div className="md:col-span-2">
            {canEditAccessLevel ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  name="submitMode"
                  value="create"
                  className="rounded-md bg-[#2dbf6e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#27a860]"
                >
                  Создать пользователя
                </button>
                <button
                  type="submit"
                  name="submitMode"
                  value="invite"
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Создать и отправить приглашение
                </button>
              </div>
            ) : (
              <button
                type="submit"
                className="rounded-md bg-[#2dbf6e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#27a860]"
              >
                Создать ученика и отправить приглашение
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
