import Link from "next/link";
import { createUser } from "@/app/actions/user-actions";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { SystemRoleMarker } from "@/components/SystemRoleMarker";
import { Button, Input, Select, buttonStyles } from "@/components/ui";
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
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        {canEditAccessLevel
          ? "Создание нового пользователя."
          : "Создание нового ученика с возможностью сразу отправить письмо с временным паролем."}
      </p>
      <AdminUsersSubtabs active="users" />

      <section className="mt-6 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-raised)] p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{canEditAccessLevel ? "Новый пользователь" : "Новый ученик"}</h2>
          <Link href="/admin/users-groups#users-section" className={buttonStyles("secondary", "sm")}>
            Назад к списку
          </Link>
        </div>
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            {error}
          </div>
        ) : null}

        <p className="mb-4 text-xs text-[var(--ink-muted)]">
          <span className="mr-1 text-[var(--danger)]" aria-hidden="true">*</span>
          Обязательные поля. Пароль обязателен при обычном создании без приглашения.
        </p>
        {!canEditAccessLevel ? (
          <div className="mb-4 rounded-md border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
            После сохранения система создаст ученика с ролью «Ученик». Письмо с временным паролем можно отправить сразу или позже.
          </div>
        ) : null}

        <form action={createUser} noValidate className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink)]"><span className="mr-1 text-[var(--danger)]" aria-hidden="true">*</span>Имя пользователя</span>
            <Input name="firstName" required defaultValue={firstNameValue} autoComplete="given-name" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink)]">Фамилия</span>
            <Input name="lastName" defaultValue={lastNameValue} autoComplete="family-name" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink)]"><span className="mr-1 text-[var(--danger)]" aria-hidden="true">*</span>Логин</span>
            <Input name="login" required defaultValue={loginValue} autoComplete="off" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink)]"><span className="mr-1 text-[var(--danger)]" aria-hidden="true">*</span>Email</span>
            <Input name="email" type="email" required defaultValue={emailValue} />
          </label>

          {canEditAccessLevel ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm text-[var(--ink)]"><span className="mr-1 text-[var(--danger)]" aria-hidden="true">*</span>Пароль</span>
                <Input
                  name="password"
                  type="password"
                  minLength={securitySettings.passwordMinLength}
                  defaultValue=""
                  autoComplete="new-password"
                />
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  {passwordHint}{" "}
                  Для обычного создания пароль обязателен. Если нажать «Создать и отправить приглашение», система создаст
                  пользователя в статусе «Ожидает подтверждения» и отправит письмо со ссылкой для активации, где пользователь
                  задаст пароль самостоятельно.
                </p>
              </label>

              <fieldset className="block md:col-span-2">
                <legend className="mb-2 block text-sm text-[var(--ink)]"><span className="mr-1 text-[var(--danger)]" aria-hidden="true">*</span>Роли</legend>
                <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-sm">
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
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  Можно выбрать несколько ролей. Первая выбранная роль станет основной для отображения.
                </p>
              </fieldset>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm text-[var(--ink)]">Статус</span>
                <Select name="status" defaultValue={statusValue}>
                  <option value={USER_STATUSES.ACTIVE}>{USER_STATUS_LABELS[USER_STATUSES.ACTIVE]}</option>
                  <option value={USER_STATUSES.PENDING}>{USER_STATUS_LABELS[USER_STATUSES.PENDING]}</option>
                  <option value={USER_STATUSES.BLOCKED}>{USER_STATUS_LABELS[USER_STATUSES.BLOCKED]}</option>
                </Select>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  Статус «Ожидает подтверждения» автоматически сменится на «Активен» после первого успешного входа.
                </p>
              </label>
            </>
          ) : (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-3 text-sm text-[var(--ink)]">
              Роль: <span className="font-medium">{ROLE_LABELS[STANDARD_ROLE_NAMES.STUDENT]}</span>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink)]">Группа</span>
            <Select name="groupId" defaultValue={groupIdValue}>
              <option value="">Не выбрана</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink)]">Подразделение</span>
            <Select name="departmentId" defaultValue={departmentIdValue}>
              <option value="">Не выбрано</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-[var(--ink)]">Организация</span>
            <Select name="organizationId" defaultValue={organizationIdValue}>
              <option value="">Не выбрана</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
          </label>

          {!canEditAccessLevel ? (
            <label className="block md:col-span-2">
              <input type="hidden" name="sendInvite" value="0" />
              <span className="inline-flex items-center gap-2 text-sm text-[var(--ink)]">
                <input type="checkbox" name="sendInvite" value="1" defaultChecked={sendInviteDefaultChecked} />
                Отправить письмо с временным паролем сразу после создания
              </span>
            </label>
          ) : null}

          <div className="md:col-span-2">
            {canEditAccessLevel ? (
              <div className="flex flex-wrap gap-3">
                <Button type="submit" name="submitMode" value="create">
                  Создать пользователя
                </Button>
                <Button type="submit" name="submitMode" value="invite" variant="secondary">
                  Создать и отправить приглашение
                </Button>
              </div>
            ) : (
              <Button type="submit">Создать ученика и отправить приглашение</Button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
