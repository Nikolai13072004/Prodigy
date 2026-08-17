import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Building2,
  KeyRound,
  Mail,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  deleteUser,
  assignCourseToUserFromProfile,
  permanentlyDeleteUser,
  resetUserPassword,
  restoreUser,
  updateUser,
} from "@/app/actions/user-actions";
import { UserAvatarInput } from "@/components/UserAvatarInput";
import { SystemRoleMarker } from "@/components/SystemRoleMarker";
import { requirePermission } from "@/lib/auth-guards";
import { assignedCourseWhere } from "@/lib/access";
import { getCourseProgress } from "@/lib/course-progress";
import prisma from "@/lib/prisma";
import {
  ensureSystemRoleProfiles,
  parsePermissionsJson,
} from "@/lib/role-profiles";
import {
  ACCESS_GROUP_LABELS,
  GROUP_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_LABELS,
  STANDARD_ROLE_NAMES,
  type AccessGroup,
  type Permission,
  hasPermission,
} from "@/lib/roles";
import { USER_STATUSES, USER_STATUS_LABELS } from "@/lib/users";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    notice?: string;
    error?: string;
    tab?: string;
    courseStatus?: string;
  }>;
};

type UserCardTab = "personal" | "structure" | "access" | "courses";
type UserCourseStatus = "not_started" | "in_progress" | "completed";
type UserCourseStatusFilter = "all" | UserCourseStatus;

export default async function EditUserPage({ params, searchParams }: Props) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_PROFILE);
  await ensureSystemRoleProfiles();
  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions,
  );
  const canDeleteUser = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_DELETE,
    session.user.permissions,
  );
  const canManageAssignments = hasPermission(
    session.user.roles,
    PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
    session.user.permissions,
  );

  const { id } = await params;
  const sp = await searchParams;

  const [user, roles, groups, departments, organizations] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        login: true,
        email: true,
        avatarUrl: true,
        role: true,
        status: true,
        departmentId: true,
        organizationId: true,
        createdAt: true,
        userRoles: {
          include: {
            roleProfile: {
              select: { id: true, name: true },
            },
          },
        },
        groupMemberships: {
          include: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
        loginEvents: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        _count: {
          select: {
            groupMemberships: true,
            directCourseAssignments: true,
            quizAttempts: true,
            itemViews: true,
            feedbacks: true,
            ownedCourses: true,
          },
        },
      },
    }),
    prisma.roleProfile.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isSystem: true, permissionsJson: true },
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

  if (!user) {
    notFound();
  }

  const userRoleNames = [
    ...new Set(
      [
        ...user.userRoles.map((item) => item.roleProfile.name),
        user.role,
      ].filter(Boolean),
    ),
  ];
  const permissionsByRoleName = new Map(
    roles.map((role) => [
      role.name,
      parsePermissionsJson(role.permissionsJson),
    ]),
  );
  const userPermissionSet = new Set<Permission>(
    userRoleNames.flatMap(
      (roleName) => permissionsByRoleName.get(roleName) ?? [],
    ),
  );
  const userPermissionGroups = (
    Object.keys(ACCESS_GROUP_LABELS) as AccessGroup[]
  )
    .map((group) => ({
      group,
      permissions: GROUP_PERMISSIONS[group].filter((permission) =>
        userPermissionSet.has(permission),
      ),
    }))
    .filter((item) => item.permissions.length > 0);
  const isStudentUser = userRoleNames.includes(STANDARD_ROLE_NAMES.STUDENT);
  const isArchivedUser = user.status === USER_STATUSES.ARCHIVED;
  const isSelfUser = session.user.id === user.id;
  if (!canEditAccessLevel && !isStudentUser) {
    notFound();
  }
  const [assignedCoursesCount, completedQuizCount] = await Promise.all([
    prisma.course.count({
      where: {
        status: "PUBLISHED",
        ...assignedCourseWhere(user.id),
      },
    }),
    prisma.quizUserBestResult.count({
      where: {
        userId: user.id,
        status: "PASSED",
      },
    }),
  ]);
  const roleSummary =
    userRoleNames.map((role) => ROLE_LABELS[role] ?? role).join(", ") ||
    "Роль не указана";
  const departmentName =
    departments.find((department) => department.id === user.departmentId)
      ?.name ?? null;
  const organizationName =
    organizations.find(
      (organization) => organization.id === user.organizationId,
    )?.name ?? null;
  const groupSummary =
    user.groupMemberships
      .map((membership) => membership.group.name)
      .join(", ") || "Не назначена";
  const lastLoginAt = user.loginEvents[0]?.createdAt ?? null;
  const profileFormId = "user-profile-form";
  const resetPasswordFormId = "user-reset-password-form";
  const archiveUserFormId = "user-archive-form";
  const restoreUserFormId = "user-restore-form";
  const permanentDeleteFormId = "user-permanent-delete-form";
  const activeTab = resolveUserCardTab(sp.tab, canEditAccessLevel);
  const tabClass = (tab: UserCardTab) =>
    tab === activeTab
      ? "shrink-0 border-b-2 border-[#2dbf6e] px-5 py-3 font-semibold text-[#0f315d] dark:text-sky-100"
      : "shrink-0 px-5 py-3 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
  const assignCourseFormId = "user-assign-course-form";
  const courseStatusFilter = asUserCourseStatusFilter(sp.courseStatus);
  const [assignedCourseRows, availableCourses] =
    activeTab === "courses"
      ? await loadUserCourseAssignments(user.id)
      : [[], []];
  const courseStatusGroups = buildUserCourseStatusGroups(assignedCourseRows);
  const visibleCourseRows =
    courseStatusFilter === "all"
      ? assignedCourseRows
      : assignedCourseRows.filter((row) => row.status === courseStatusFilter);

  return (
    <main className="mx-auto max-w-6xl">
      <Link
        href="/admin/users-groups?tab=users"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Назад к списку
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {canEditAccessLevel ? "Редактировать пользователя" : "Редактировать ученика"}
      </h1>

      <section className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="border-b border-zinc-200 bg-gradient-to-r from-white via-sky-50/80 to-white p-5 dark:border-zinc-800 dark:from-zinc-900 dark:via-sky-950/20 dark:to-zinc-900 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <UserAvatarInput
                userId={user.id}
                initialValue={user.avatarUrl}
                displayName={user.name}
                initials={getInitials(user.name)}
                disabled={isArchivedUser}
                formId={profileFormId}
                statusDotClass={getUserStatusDotClass(user.status)}
                variant="header"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                    {user.name}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${getUserStatusBadgeClass(user.status)}`}
                  >
                    {USER_STATUS_LABELS[
                      user.status as keyof typeof USER_STATUS_LABELS
                    ] ?? user.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    {user.login}
                  </span>
                  <span className="hidden text-zinc-300 sm:inline">·</span>
                  <span>{roleSummary}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <InfoPill
                    icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}
                    label={groupSummary}
                  />
                  <InfoPill
                    icon={
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    }
                    label={departmentName ?? "Подразделение не указано"}
                  />
                  <InfoPill
                    icon={
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    }
                    label={organizationName ?? "Организация не указана"}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {user.email ? (
                <a
                  href={`mailto:${user.email}`}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Написать
                </a>
              ) : null}
              {isStudentUser ? (
                <Link
                  href={`/admin/reports/${user.id}?fromUser=1`}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-[#0f315d] px-3 text-sm font-medium text-white transition hover:bg-[#0b2547]"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Отчет
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProfileMetric
              label="Назначено курсов"
              value={String(assignedCoursesCount)}
              hint={`${user._count.directCourseAssignments} напрямую`}
            />
            <ProfileMetric
              label="Пройдено тестов"
              value={String(completedQuizCount)}
              hint={`${user._count.quizAttempts} попыток`}
            />
            <ProfileMetric
              label="Группы"
              value={String(user._count.groupMemberships)}
              hint={groupSummary}
            />
            <ProfileMetric
              label="Последний вход"
              value={lastLoginAt ? formatDateTimeRu(lastLoginAt) : "Не входил"}
              hint={`Создан ${formatDateRu(user.createdAt)}`}
            />
          </div>
        </div>
        <div className="flex overflow-x-auto border-b border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Link
            href={userEditTabHref(user.id, "personal")}
            className={tabClass("personal")}
          >
            Персональная информация
          </Link>
          <Link
            href={userEditTabHref(user.id, "structure")}
            className={tabClass("structure")}
          >
            Группы и структура
          </Link>
          {canEditAccessLevel ? (
            <Link
              href={userEditTabHref(user.id, "access")}
              className={tabClass("access")}
            >
              Уровень доступа
            </Link>
          ) : null}
          <Link
            href={userEditTabHref(user.id, "courses")}
            className={tabClass("courses")}
          >
            Назначенные курсы
          </Link>
        </div>
        <div className="min-h-[34rem] p-5 sm:min-h-[35rem] sm:p-6">
          {sp.notice ? (
            <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              {sp.notice}
            </div>
          ) : null}
          {sp.error ? (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {sp.error}
            </div>
          ) : null}
          {!canEditAccessLevel ? (
            <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
              В этой форме HR может менять только имя, фамилию, email, группу и
              подразделение. Логин, роли, статус и пароль здесь недоступны.
            </div>
          ) : null}

          <form
            id={profileFormId}
            action={updateUser.bind(null, user.id)}
            className="space-y-8"
          >
            <input type="hidden" name="returnTab" value={activeTab} />
            {activeTab !== "personal" ? (
              <>
                <input type="hidden" name="firstName" value={user.firstName || user.name} />
                <input type="hidden" name="lastName" value={user.lastName ?? ""} />
                <input type="hidden" name="login" value={user.login} />
                <input type="hidden" name="email" value={user.email ?? ""} />
              </>
            ) : null}
            {activeTab !== "structure" ? (
              <>
                {activeTab === "personal" && !canEditAccessLevel ? null : (
                  <>
                    <input
                      type="hidden"
                      name="groupId"
                      value={user.groupMemberships[0]?.groupId ?? ""}
                    />
                    <input
                      type="hidden"
                      name="departmentId"
                      value={user.departmentId ?? ""}
                    />
                  </>
                )}
                <input
                  type="hidden"
                  name="organizationId"
                  value={user.organizationId ?? ""}
                />
              </>
            ) : null}
            {canEditAccessLevel && activeTab !== "access" ? (
              <>
                {userRoleNames.map((roleName) => (
                  <input
                    key={roleName}
                    type="hidden"
                    name="role"
                    value={roleName}
                  />
                ))}
              </>
            ) : null}
            {activeTab === "personal" ? (
              <section id="personal-info" className="scroll-mt-24">
                <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Общая информация о пользователе
                    </h3>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-md bg-[#2dbf6e] px-4 text-sm font-semibold text-white hover:bg-[#27a860]"
                  >
                    {canEditAccessLevel ? "Сохранить изменения" : "Сохранить профиль"}
                  </button>
                </div>

                <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="space-y-4">
                    <ProfileFieldRow label="Имя" required>
                      <input
                        name="firstName"
                        required
                        defaultValue={user.firstName || user.name}
                        autoComplete="given-name"
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </ProfileFieldRow>

                    <ProfileFieldRow label="Фамилия">
                      <input
                        name="lastName"
                        defaultValue={user.lastName ?? ""}
                        autoComplete="family-name"
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </ProfileFieldRow>

                    <ProfileFieldRow label="Login" required>
                      {canEditAccessLevel ? (
                        <input
                          name="login"
                          required
                          defaultValue={user.login}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      ) : (
                        <>
                          <input
                            defaultValue={user.login}
                            disabled
                            className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
                          />
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Логин используется для входа на платформу и доступен для изменения только администратору.
                          </p>
                        </>
                      )}
                    </ProfileFieldRow>

                    <ProfileFieldRow label="Email">
                      <input
                        name="email"
                        type="email"
                        defaultValue={user.email ?? ""}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </ProfileFieldRow>

                    {!canEditAccessLevel ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">
                            Подразделение
                          </span>
                          <select
                            name="departmentId"
                            defaultValue={user.departmentId ?? ""}
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
                          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">
                            Группа
                          </span>
                          <select
                            name="groupId"
                            defaultValue={user.groupMemberships[0]?.groupId ?? ""}
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
                      </div>
                    ) : null}

                    {canEditAccessLevel ? (
                      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                        <h4 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          Пароль
                        </h4>
                        <div className="mt-4 space-y-4">
                          <ProfileFieldRow label="Новый пароль">
                            <input
                              name="password"
                              type="password"
                              autoComplete="new-password"
                              disabled={isArchivedUser}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-950"
                            />
                          </ProfileFieldRow>
                          <ProfileFieldRow label="Повторите пароль">
                            <input
                              name="passwordConfirm"
                              type="password"
                              autoComplete="new-password"
                              disabled={isArchivedUser}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-950"
                            />
                          </ProfileFieldRow>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                          Оставьте поля пустыми, если пароль менять не нужно.
                        </p>
                        <button
                          type="submit"
                          disabled={isArchivedUser}
                          className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-[#0f315d] px-4 text-sm font-semibold text-white hover:bg-[#0b2547] disabled:cursor-not-allowed disabled:bg-zinc-300"
                        >
                          Сохранить новый пароль
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <aside className="space-y-5 border-t border-zinc-200 pt-6 dark:border-zinc-800 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    {canEditAccessLevel ? (
                      <div>
                        <button
                          type="submit"
                          form={resetPasswordFormId}
                          disabled={!user.email || isArchivedUser}
                          className="inline-flex items-center gap-2 text-sm font-medium text-[#0f7896] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline"
                        >
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                          Сбросить пароль и отправить временный пароль
                        </button>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Сгенерируем временный пароль и отправим на email.
                        </p>
                      </div>
                    ) : null}

                    {canEditAccessLevel ? (
                      <div>
                        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          <span className="mb-1 block">Статус</span>
                          <select
                            name="status"
                            defaultValue={user.status}
                            disabled={isSelfUser || isArchivedUser}
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-950"
                          >
                            <option value={USER_STATUSES.ACTIVE}>
                              {USER_STATUS_LABELS[USER_STATUSES.ACTIVE]}
                            </option>
                            <option value={USER_STATUSES.PENDING}>
                              {USER_STATUS_LABELS[USER_STATUSES.PENDING]}
                            </option>
                            <option value={USER_STATUSES.BLOCKED}>
                              {USER_STATUS_LABELS[USER_STATUSES.BLOCKED]}
                            </option>
                            {isArchivedUser ? (
                              <option value={USER_STATUSES.ARCHIVED}>
                                {USER_STATUS_LABELS[USER_STATUSES.ARCHIVED]}
                              </option>
                            ) : null}
                          </select>
                        </label>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {isArchivedUser
                            ? "Архивированного пользователя можно вернуть через восстановление."
                            : isSelfUser
                              ? "Нельзя заблокировать текущего пользователя."
                              : "Статус управляет доступом пользователя к платформе."}
                        </p>
                      </div>
                    ) : null}

                    {canDeleteUser ? (
                      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                        {isArchivedUser ? (
                          <button
                            type="submit"
                            form={restoreUserFormId}
                            disabled={isSelfUser}
                            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline dark:text-emerald-300"
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            Восстановить пользователя
                          </button>
                        ) : (
                          <button
                            type="submit"
                            form={archiveUserFormId}
                            disabled={isSelfUser}
                            className="inline-flex items-center gap-2 text-sm font-medium text-red-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline dark:text-red-300"
                          >
                            <Archive className="h-4 w-4" aria-hidden="true" />
                            Архивировать пользователя
                          </button>
                        )}
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {isArchivedUser
                            ? "Пользователь снова получит доступ после восстановления."
                            : isSelfUser
                              ? "Нельзя архивировать текущего пользователя."
                            : "Доступ закроется, история обучения сохранится."}
                        </p>
                      </div>
                    ) : null}

                    {canDeleteUser && isArchivedUser ? (
                      <section className="border-t border-red-200 pt-5 dark:border-red-900/70">
                        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-100">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Окончательное удаление
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-red-700 dark:text-red-200">
                          Профиль пользователя, назначения, прогресс, ответы
                          тестов, отзывы и история входов будут удалены. Логин
                          и email освободятся для повторного создания.
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-red-700/80 dark:text-red-200/80">
                          Старые ожидающие письма и приглашения по этому email
                          тоже будут удалены. Действие нельзя отменить.
                        </p>
                        <label className="mt-3 flex items-start gap-2 text-xs text-red-800 dark:text-red-100">
                          <input
                            form={permanentDeleteFormId}
                            type="checkbox"
                            name="confirmPermanentDelete"
                            value="1"
                            required
                            className="mt-1"
                          />
                          <span>
                            Подтверждаю окончательное удаление пользователя{" "}
                            {user.login}.
                          </span>
                        </label>
                        <button
                          form={permanentDeleteFormId}
                          type="submit"
                          disabled={isSelfUser}
                          className="mt-3 inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Удалить окончательно
                        </button>
                      </section>
                    ) : null}
                  </aside>
                </div>
              </section>
            ) : null}

            {canEditAccessLevel && activeTab === "access" ? (
              <section id="access-level" className="scroll-mt-24">
                <div className="mb-5 flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Уровень доступа
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Роли пользователя в системе.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-md bg-[#2dbf6e] px-4 text-sm font-semibold text-white hover:bg-[#27a860]"
                  >
                    Сохранить
                  </button>
                </div>
                <fieldset>
                  <legend className="sr-only">Роли</legend>
                  <div className="grid gap-2 rounded-md border border-zinc-300 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                    {roles.map((role) => (
                      <label key={role.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="role"
                          value={role.name}
                          defaultChecked={userRoleNames.includes(role.name)}
                        />
                        <span className="inline-flex items-center gap-1.5">
                          <span>{ROLE_LABELS[role.name] ?? role.name}</span>
                          {role.isSystem ? <SystemRoleMarker /> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Можно выбрать несколько ролей. Основной будет первая
                    сохраненная роль.
                  </p>
                </fieldset>
                <UserPermissionsDisclosure
                  permissionsCount={userPermissionSet.size}
                  permissionGroups={userPermissionGroups}
                />
              </section>
            ) : null}

            {activeTab === "structure" ? (
              <section id="structure" className="scroll-mt-24">
                <div className="mb-5 flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Группы и структура
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Группа обучения, подразделение и организация пользователя.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center rounded-md bg-[#2dbf6e] px-4 text-sm font-semibold text-white hover:bg-[#27a860]"
                  >
                    Сохранить
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">
                      Группа
                    </span>
                    <select
                      name="groupId"
                      defaultValue={user.groupMemberships[0]?.groupId ?? ""}
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
                    <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">
                      Подразделение
                    </span>
                    <select
                      name="departmentId"
                      defaultValue={user.departmentId ?? ""}
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
                    <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-200">
                      Организация
                    </span>
                    <select
                      name="organizationId"
                      defaultValue={user.organizationId ?? ""}
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
                </div>
              </section>
            ) : null}

            {activeTab === "courses" ? (
              <section id="assigned-courses" className="scroll-mt-24">
                <div className="mb-5 flex flex-col items-end gap-3 border-b border-zinc-200 pb-5 dark:border-zinc-800">
                  {canManageAssignments ? (
                    <details className="group relative">
                      <summary className="inline-flex h-9 cursor-pointer list-none items-center justify-center rounded-md bg-[#2dbf6e] px-4 text-sm font-semibold text-white hover:bg-[#27a860] group-open:bg-[#27a860] [&::-webkit-details-marker]:hidden">
                        Назначить курс
                      </summary>
                      <div className="absolute right-0 z-10 mt-2 w-[min(28rem,calc(100vw-3rem))] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            Курс
                          </span>
                          <select
                            id="assign-course-id"
                            name="courseId"
                            form={assignCourseFormId}
                            defaultValue=""
                            disabled={isArchivedUser || availableCourses.length === 0}
                            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900"
                          >
                            <option value="">
                              {availableCourses.length > 0
                                ? "Выберите опубликованный курс"
                                : "Нет доступных курсов"}
                            </option>
                            {availableCourses.map((course) => (
                              <option key={course.id} value={course.id}>
                                {course.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            Выполнить до
                          </span>
                          <input
                            type="date"
                            name="accessExpiresOn"
                            form={assignCourseFormId}
                            disabled={isArchivedUser || availableCourses.length === 0}
                            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900"
                          />
                        </label>
                        <button
                          type="submit"
                          form={assignCourseFormId}
                          disabled={isArchivedUser || availableCourses.length === 0}
                          className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-[#2dbf6e] px-4 text-sm font-semibold text-white hover:bg-[#27a860] disabled:cursor-not-allowed disabled:bg-zinc-300"
                        >
                          Назначить курс
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>

                <div className="mb-4 flex flex-wrap gap-2 text-sm">
                  <Link
                    href={userCoursesStatusHref(user.id, "all")}
                    className={getCourseStatusFilterClass(
                      courseStatusFilter === "all",
                    )}
                  >
                    Все: {assignedCourseRows.length}
                  </Link>
                  {courseStatusGroups.map((group) => (
                    <Link
                      key={group.status}
                      href={userCoursesStatusHref(user.id, group.status)}
                      className={getCourseStatusFilterClass(
                        courseStatusFilter === group.status,
                      )}
                    >
                      {group.label}: {group.rows.length}
                    </Link>
                  ))}
                </div>

                {visibleCourseRows.length > 0 ? (
                  <AssignedCoursesTable
                    rows={visibleCourseRows}
                    returnUserId={user.id}
                  />
                ) : (
                  <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    Назначенных курсов нет.
                  </div>
                )}
              </section>
            ) : null}
          </form>

          <form
            id={assignCourseFormId}
            action={assignCourseToUserFromProfile.bind(null, user.id)}
            className="hidden"
          />

          {canEditAccessLevel ? (
            <form
              id={resetPasswordFormId}
              action={resetUserPassword.bind(null, user.id)}
              className="hidden"
            />
          ) : null}

          {canDeleteUser ? (
            <>
              {isArchivedUser ? (
                <form
                  id={restoreUserFormId}
                  action={restoreUser.bind(null, user.id)}
                  className="hidden"
                >
                  <input type="hidden" name="returnTab" value={activeTab} />
                </form>
              ) : (
                <form
                  id={archiveUserFormId}
                  action={deleteUser.bind(null, user.id)}
                  className="hidden"
                >
                  <input type="hidden" name="returnTab" value={activeTab} />
                </form>
              )}

              {isArchivedUser ? (
                <form
                  id={permanentDeleteFormId}
                  action={permanentlyDeleteUser.bind(null, user.id)}
                  className="hidden"
                />
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

type UserAssignedCourseRow = {
  id: string;
  title: string;
  description: string | null;
  status: UserCourseStatus;
  progressPercent: number;
  completedRequired: number;
  requiredTotal: number;
  assignedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
};

type AvailableCourseOption = {
  id: string;
  title: string;
};

async function loadUserCourseAssignments(
  userId: string,
): Promise<[UserAssignedCourseRow[], AvailableCourseOption[]]> {
  const [assignedCourses, availableCourses] = await Promise.all([
    prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        ...assignedCourseWhere(userId),
      },
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        quizGateMode: true,
        directAssignments: {
          where: { userId },
          select: { assignedAt: true, expiresAt: true },
        },
        groupAssignments: {
          where: {
            group: {
              memberships: {
                some: { userId },
              },
            },
          },
          select: {
            assignedAt: true,
            expiresAt: true,
            group: { select: { name: true } },
          },
        },
        items: {
          where: { archivedAt: null },
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            title: true,
            type: true,
            isRequired: true,
            views: {
              where: { userId },
              select: { progressPercent: true, viewedAt: true },
              take: 1,
            },
            quiz: {
              select: {
                maxAttempts: true,
                minCorrectAnswers: true,
                attempts: {
                  where: { userId },
                  orderBy: { attemptNumber: "asc" },
                  select: {
                    id: true,
                    outcome: true,
                    correctAnswers: true,
                    attemptNumber: true,
                    score: true,
                    maxScore: true,
                    completedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        NOT: assignedCourseWhere(userId),
      },
      orderBy: [{ title: "asc" }],
      select: { id: true, title: true },
    }),
  ]);

  const rows = assignedCourses
    .map((course): UserAssignedCourseRow => {
      const progress = getCourseProgress({
        courseTitle: course.title,
        courseDescription: course.description,
        quizGateMode: course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED",
        items: course.items.map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          isRequired: item.isRequired,
          materialProgress: item.views[0]?.progressPercent ?? 0,
          viewed: (item.views[0]?.progressPercent ?? 0) >= 100,
          quiz: item.quiz
            ? {
                maxAttempts: item.quiz.maxAttempts,
                minCorrectAnswers: item.quiz.minCorrectAnswers,
                attempts: item.quiz.attempts,
              }
            : null,
        })),
      });
      const assignmentDates = [
        ...course.directAssignments.map((assignment) => assignment.assignedAt),
        ...course.groupAssignments.map((assignment) => assignment.assignedAt),
      ];
      const expiryDates = [
        ...course.directAssignments.map((assignment) => assignment.expiresAt),
        ...course.groupAssignments.map((assignment) => assignment.expiresAt),
      ].filter((value): value is Date => Boolean(value));
      const status = getUserCourseProgressStatus(progress);
      const completedAt =
        status === "completed" ? getUserCourseCompletionDate(course.items) : null;

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        status,
        progressPercent: progress.percent,
        completedRequired: progress.completedRequired,
        requiredTotal: progress.requiredTotal,
        assignedAt: assignmentDates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null,
        completedAt,
        expiresAt: expiryDates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null,
      };
    });

  return [rows, availableCourses];
}

function buildUserCourseStatusGroups(rows: UserAssignedCourseRow[]) {
  return (["in_progress", "not_started", "completed"] as const).map(
    (status) => ({
      status,
      label: getUserCourseStatusLabel(status),
      rows: rows.filter((row) => row.status === status),
    }),
  );
}

function resolveUserCardTab(
  value: string | undefined,
  canEditAccessLevel: boolean,
): UserCardTab {
  if (value === "structure") return "structure";
  if (value === "access" && canEditAccessLevel) return "access";
  if (value === "courses") return "courses";
  return "personal";
}

function userEditTabHref(userId: string, tab: UserCardTab) {
  if (tab === "personal") return `/admin/users/${userId}/edit`;
  return `/admin/users/${userId}/edit?tab=${tab}`;
}

function userCoursesStatusHref(
  userId: string,
  status: UserCourseStatusFilter,
) {
  if (status === "all") return userEditTabHref(userId, "courses");
  return `/admin/users/${userId}/edit?tab=courses&courseStatus=${status}`;
}

function asUserCourseStatusFilter(
  value: string | undefined,
): UserCourseStatusFilter {
  return value === "not_started" ||
    value === "in_progress" ||
    value === "completed"
    ? value
    : "all";
}

function getUserCourseProgressStatus(
  progress: ReturnType<typeof getCourseProgress>,
): UserCourseStatus {
  if (
    progress.requiredTotal > 0 &&
    progress.completedRequired >= progress.requiredTotal
  ) {
    return "completed";
  }
  if (progress.percent > 0) return "in_progress";
  return "not_started";
}

function getUserCourseStatusLabel(status: UserCourseStatus) {
  if (status === "completed") return "Завершен";
  if (status === "in_progress") return "В процессе";
  return "Не начат";
}

function getCourseStatusBadgeClass(status: UserCourseStatus) {
  if (status === "completed")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (status === "in_progress")
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

function getCourseStatusFilterClass(isActive: boolean) {
  return isActive
    ? "rounded-full bg-[#0f315d] px-3 py-1.5 font-medium text-white"
    : "rounded-full bg-zinc-100 px-3 py-1.5 font-medium text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";
}

function getUserCourseCompletionDate(
  items: Array<{
    isRequired: boolean;
    type: string;
    views: Array<{ progressPercent: number; viewedAt: Date }>;
    quiz: {
      attempts: Array<{ outcome: string; completedAt: Date }>;
    } | null;
  }>,
) {
  const requiredItems = items.filter((item) => item.isRequired);
  if (requiredItems.length === 0) return null;

  const completionDates = requiredItems
    .map((item) => {
      if (item.type === "QUIZ" && item.quiz) {
        return (
          item.quiz.attempts
            .filter((attempt) => attempt.outcome === "PASSED")
            .sort(
              (left, right) =>
                left.completedAt.getTime() - right.completedAt.getTime(),
            )[0]?.completedAt ?? null
        );
      }

      const view = item.views[0];
      return view && view.progressPercent >= 100 ? view.viewedAt : null;
    })
    .filter((value): value is Date => Boolean(value));

  if (completionDates.length !== requiredItems.length) return null;
  return completionDates.sort(
    (left, right) => right.getTime() - left.getTime(),
  )[0];
}

function AssignedCoursesTable({
  rows,
  returnUserId,
}: {
  rows: UserAssignedCourseRow[];
  returnUserId: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="overflow-x-auto">
        <table className="min-w-[50rem] divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950/40 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Название</th>
              <th className="whitespace-nowrap px-4 py-3">Статус</th>
              <th className="whitespace-nowrap px-4 py-3">Прогресс</th>
              <th className="whitespace-nowrap px-4 py-3">
                Дата назначения
              </th>
              <th className="whitespace-nowrap px-4 py-3">
                Дата завершения
              </th>
              <th className="whitespace-nowrap px-4 py-3">Выполнить до</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group transition hover:bg-sky-50/70 dark:hover:bg-sky-950/20"
              >
                <td className="min-w-64 px-4 py-3">
                  <Link
                    href={courseManageFromUserHref(row.id, returnUserId)}
                    className="-m-4 block px-4 py-3"
                  >
                    <span className="block font-medium text-zinc-950 group-hover:text-[#0b76a8] dark:text-zinc-50 dark:group-hover:text-sky-300">
                      {row.title}
                    </span>
                    {row.description ? (
                      <span className="mt-1 block line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {row.description}
                      </span>
                    ) : null}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={courseManageFromUserHref(row.id, returnUserId)}
                    className="-m-4 block px-4 py-3"
                  >
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${getCourseStatusBadgeClass(row.status)}`}
                    >
                      {getUserCourseStatusLabel(row.status)}
                    </span>
                  </Link>
                </td>
                <td className="min-w-36 px-4 py-3">
                  <Link
                    href={courseManageFromUserHref(row.id, returnUserId)}
                    className="-m-4 block px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-[#0b8db3]"
                          style={{ width: `${row.progressPercent}%` }}
                        />
                      </div>
                      <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
                        {row.progressPercent}%
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {row.completedRequired}/{row.requiredTotal || 0} этапов
                    </div>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  <Link
                    href={courseManageFromUserHref(row.id, returnUserId)}
                    className="-m-4 block px-4 py-3"
                  >
                    {row.assignedAt
                      ? formatDateRu(row.assignedAt)
                      : "Не указана"}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  <Link
                    href={courseManageFromUserHref(row.id, returnUserId)}
                    className="-m-4 block px-4 py-3"
                  >
                    {row.completedAt ? formatDateRu(row.completedAt) : "-"}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  <Link
                    href={courseManageFromUserHref(row.id, returnUserId)}
                    className="-m-4 block px-4 py-3"
                  >
                    {row.expiresAt ? formatDateRu(row.expiresAt) : "-"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function courseManageFromUserHref(courseId: string, userId: string) {
  return `/courses/${courseId}/manage?fromUser=${encodeURIComponent(userId)}`;
}

function getInitials(input: string) {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getUserStatusBadgeClass(status: string) {
  if (status === USER_STATUSES.ACTIVE)
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (status === USER_STATUSES.PENDING)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  if (status === USER_STATUSES.BLOCKED)
    return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  if (status === USER_STATUSES.ARCHIVED)
    return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300";
}

function getUserStatusDotClass(status: string) {
  if (status === USER_STATUSES.ACTIVE) return "bg-emerald-500";
  if (status === USER_STATUSES.PENDING) return "bg-amber-500";
  if (status === USER_STATUSES.BLOCKED) return "bg-red-500";
  if (status === USER_STATUSES.ARCHIVED) return "bg-zinc-400";
  return "bg-sky-500";
}

function InfoPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sky-100 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 shadow-sm dark:border-sky-900/60 dark:bg-zinc-950 dark:text-zinc-300">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

function ProfileMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
        {hint}
      </div>
    </div>
  );
}

function UserPermissionsDisclosure({
  permissionsCount,
  permissionGroups,
}: {
  permissionsCount: number;
  permissionGroups: Array<{ group: AccessGroup; permissions: Permission[] }>;
}) {
  const permissionLabelByKey = new Map(
    PERMISSION_DEFINITIONS.map((definition) => [
      definition.key,
      definition.label,
    ]),
  );

  return (
    <details className="group mt-5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/30">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-[#0f315d] transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-sky-100 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        <span className="group-open:hidden">Показать права пользователя</span>
        <span className="hidden group-open:inline">
          Скрыть права пользователя
        </span>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-sky-950/40 dark:text-zinc-300">
          {permissionsCount}
        </span>
      </summary>

      <div className="mt-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Список рассчитан по сохраненным ролям пользователя.
        </p>

        {permissionGroups.length > 0 ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {permissionGroups.map(({ group, permissions }) => (
              <section
                key={group}
                className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {ACCESS_GROUP_LABELS[group]}
                </h4>
                <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {permissions.map((permission) => (
                    <li key={permission} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2dbf6e]" />
                      <span>
                        {permissionLabelByKey.get(permission) ?? permission}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            Для сохраненных ролей права не настроены.
          </p>
        )}
      </div>
    </details>
  );
}

function ProfileFieldRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
      <span className="grid grid-cols-[0.75rem_minmax(0,1fr)] items-center text-sm text-zinc-700 dark:text-zinc-200">
        <span className="text-red-600 dark:text-red-400" aria-hidden="true">
          {required ? "*" : ""}
        </span>
        <span>{label}:</span>
      </span>
      <span>{children}</span>
    </label>
  );
}

function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatDateTimeRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
