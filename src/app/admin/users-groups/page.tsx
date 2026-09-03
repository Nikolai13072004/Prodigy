import Link from "next/link";
import { createGroup, setGroupMembers, updateGroup } from "@/app/actions/group-actions";
import { bulkArchiveUsers } from "@/app/actions/user-actions";
import { AdminUsersSubtabs } from "@/components/AdminUsersSubtabs";
import { AdminCreateGroupModal } from "@/components/AdminCreateGroupModal";
import { AdminUserInteractiveCell } from "@/components/AdminUserInteractiveCell";
import { Button, buttonStyles, Input, Select } from "@/components/ui";
import { requirePermission } from "@/lib/auth-guards";
import { getGroupProgressReportData } from "@/lib/group-progress-report";
import prisma from "@/lib/prisma";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { PERMISSIONS, ROLE_LABELS, STANDARD_ROLE_NAMES, hasPermission } from "@/lib/roles";
import { USER_STATUSES, USER_STATUS_LABELS, isAccessRevokedUserStatus, isUserStatus } from "@/lib/users";
import type { Prisma } from "@prisma/client";

type Props = {
  searchParams: Promise<{
    q?: string;
    tab?: string;
    role?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
    page?: string;
    pageSize?: string;
    notice?: string;
    groupId?: string;
    groupQuery?: string;
    groupCourseId?: string;
    groupNotice?: string;
    groupError?: string;
  }>;
};

type SortDirection = "asc" | "desc";
type UserSortField =
  | "id"
  | "name"
  | "email"
  | "status"
  | "department"
  | "organization"
  | "groups"
  | "role"
  | "createdAt"
  | "lastLoginAt";
type UserTableRow = {
  id: string;
  name: string;
  login: string;
  avatarUrl: string | null;
  email: string | null;
  status: string;
  statusLabel: string;
  departmentName: string;
  organizationName: string;
  groupsCount: number;
  roleLabels: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
};

const PAGE_SIZES = [10, 20, 50] as const;
const SORT_FIELDS: UserSortField[] = [
  "id",
  "name",
  "email",
  "status",
  "department",
  "organization",
  "groups",
  "role",
  "createdAt",
  "lastLoginAt",
];

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseDateInput(value: string | undefined) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function dateStart(value: string) {
  return new Date(`${value}T00:00:00.000`);
}

function dateEnd(value: string) {
  return new Date(`${value}T23:59:59.999`);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function compareText(left: string, right: string, dir: SortDirection) {
  const result = left.localeCompare(right, "ru", { sensitivity: "base", numeric: true });
  return dir === "asc" ? result : -result;
}

function compareOptionalText(left: string | null, right: string | null, dir: SortDirection) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return compareText(left, right, dir);
}

function compareNumber(left: number, right: number, dir: SortDirection) {
  return dir === "asc" ? left - right : right - left;
}

function compareDate(left: Date, right: Date, dir: SortDirection) {
  return dir === "asc" ? left.getTime() - right.getTime() : right.getTime() - left.getTime();
}

function compareOptionalDate(left: Date | null, right: Date | null, dir: SortDirection) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return compareDate(left, right, dir);
}

function sortUserRows(rows: UserTableRow[], sortBy: UserSortField, sortDir: SortDirection) {
  return [...rows].sort((left, right) => {
    const result =
      sortBy === "id"
        ? compareText(left.id, right.id, sortDir)
        : sortBy === "email"
          ? compareOptionalText(left.email, right.email, sortDir)
          : sortBy === "status"
            ? compareText(left.statusLabel, right.statusLabel, sortDir)
            : sortBy === "department"
              ? compareText(left.departmentName, right.departmentName, sortDir)
              : sortBy === "organization"
                ? compareText(left.organizationName, right.organizationName, sortDir)
              : sortBy === "groups"
                ? compareNumber(left.groupsCount, right.groupsCount, sortDir)
                : sortBy === "role"
                  ? compareText(left.roleLabels.join(", "), right.roleLabels.join(", "), sortDir)
                  : sortBy === "createdAt"
                    ? compareDate(left.createdAt, right.createdAt, sortDir)
                    : sortBy === "lastLoginAt"
                      ? compareOptionalDate(left.lastLoginAt, right.lastLoginAt, sortDir)
                      : compareText(left.name, right.name, sortDir);

    if (result !== 0) return result;

    const nameFallback = compareText(left.name, right.name, "asc");
    if (nameFallback !== 0) return nameFallback;
    return compareText(left.id, right.id, "asc");
  });
}

export default async function UsersGroupsPage({ searchParams }: Props) {
  const session = await requirePermission(PERMISSIONS.USERS_VIEW);
  await ensureSystemRoleProfiles();

  const sp = await searchParams;
  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions
  );
  const canViewGroups = hasPermission(session.user.roles, PERMISSIONS.GROUPS_VIEW, session.user.permissions);
  const canCreateGroups = hasPermission(session.user.roles, PERMISSIONS.GROUPS_CREATE, session.user.permissions);
  const canEditGroups = hasPermission(session.user.roles, PERMISSIONS.GROUPS_EDIT, session.user.permissions);
  const canDeleteUsers = hasPermission(session.user.roles, PERMISSIONS.USERS_DELETE, session.user.permissions);
  const canViewGroupReports = hasPermission(session.user.roles, PERMISSIONS.REPORTS_VIEW, session.user.permissions);
  const tab = sp.tab === "groups" && canViewGroups ? "groups" : "users";
  const selectedGroupId = canViewGroups ? (sp.groupId ?? "").trim() : "";
  const groupQuery = canViewGroups ? (sp.groupQuery ?? "").trim() : "";
  const rawGroupCourseId = canViewGroups && canViewGroupReports ? (sp.groupCourseId ?? "").trim() : "";

  const q = (sp.q ?? "").trim();
  const role = canEditAccessLevel ? (sp.role ?? "").trim() : "";
  const status = isUserStatus(String(sp.status ?? "")) ? String(sp.status) : "";
  const dateFrom = parseDateInput(sp.dateFrom);
  const dateTo = parseDateInput(sp.dateTo);
  const sortBy = SORT_FIELDS.includes(sp.sortBy as UserSortField) ? (sp.sortBy as UserSortField) : "name";
  const sortDir: SortDirection = sp.sortDir === "desc" ? "desc" : "asc";
  const pageSize = PAGE_SIZES.includes(Number(sp.pageSize) as (typeof PAGE_SIZES)[number])
    ? Number(sp.pageSize)
    : PAGE_SIZES[0];

  const filters: Prisma.UserWhereInput[] = [];

  if (!canEditAccessLevel) {
    filters.push({
      OR: [
        { role: STANDARD_ROLE_NAMES.STUDENT },
        {
          userRoles: {
            some: {
              roleProfile: {
                name: STANDARD_ROLE_NAMES.STUDENT,
              },
            },
          },
        },
      ],
    });
  }

  if (q) {
    filters.push({
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { login: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }

  if (role) {
    filters.push({
      OR: [
        { role },
        {
          userRoles: {
            some: {
              roleProfile: {
                name: role,
              },
            },
          },
        },
      ],
    });
  }

  if (status) {
    filters.push({ status });
  } else {
    filters.push({
      status: {
        not: USER_STATUSES.ARCHIVED,
      },
    });
  }

  if (dateFrom || dateTo) {
    filters.push({
      createdAt: {
        ...(dateFrom ? { gte: dateStart(dateFrom) } : {}),
        ...(dateTo ? { lte: dateEnd(dateTo) } : {}),
      },
    });
  }

  const usersWhere: Prisma.UserWhereInput = filters.length ? { AND: filters } : {};

  const [roles, groups, rawUsers] = await Promise.all([
    prisma.roleProfile.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                login: true,
                email: true,
                status: true,
                department: {
                  select: { name: true },
                },
                organization: {
                  select: { name: true },
                },
              },
            },
          },
        },
        _count: {
          select: { memberships: true },
        },
      },
    }),
    prisma.user.findMany({
      where: usersWhere,
      include: {
        department: {
          select: { id: true, name: true },
        },
        organization: {
          select: { id: true, name: true },
        },
        userRoles: {
          include: {
            roleProfile: {
              select: { name: true },
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
      },
    }),
  ]);
  const visibleRoles = canEditAccessLevel
    ? roles
    : roles.filter((item) => item.name === STANDARD_ROLE_NAMES.STUDENT);

  const userRows = sortUserRows(
    rawUsers.map((user) => {
      const statusLabel = isUserStatus(user.status) ? USER_STATUS_LABELS[user.status] : user.status;
      const userRoleNames = [
        ...new Set([...user.userRoles.map((item) => item.roleProfile.name), user.role].filter(Boolean)),
      ];

      return {
        id: user.id,
        name: user.name,
        login: user.login,
        avatarUrl: user.avatarUrl,
        email: user.email,
        status: user.status,
        statusLabel,
        departmentName: user.department?.name ?? "Не указано",
        organizationName: user.organization?.name ?? "Не указана",
        groupsCount: user.groupMemberships.length,
        roleLabels: userRoleNames.map((item) => ROLE_LABELS[item] ?? item),
        createdAt: user.createdAt,
        lastLoginAt: user.loginEvents[0]?.createdAt ?? null,
      };
    }),
    sortBy,
    sortDir
  );

  const usersTotal = userRows.length;
  const totalPages = Math.max(1, Math.ceil(usersTotal / pageSize));
  const page = Math.min(parsePositiveInt(sp.page, 1), totalPages);
  const users = userRows.slice((page - 1) * pageSize, page * pageSize);

  const buildUsersHref = (
    overrides: Partial<{
      q: string;
      role: string;
      status: string;
      dateFrom: string;
      dateTo: string;
      sortBy: UserSortField;
      sortDir: SortDirection;
      page: string;
      pageSize: string;
    }> = {}
  ) => {
    const params = new URLSearchParams();
    params.set("tab", "users");

    const next = {
      q,
      role,
      status,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
      page: String(page),
      pageSize: String(pageSize),
      ...overrides,
    };

    if (next.q) params.set("q", next.q);
    if (next.role) params.set("role", next.role);
    if (next.status) params.set("status", next.status);
    if (next.dateFrom) params.set("dateFrom", next.dateFrom);
    if (next.dateTo) params.set("dateTo", next.dateTo);
    params.set("sortBy", next.sortBy);
    params.set("sortDir", next.sortDir);
    params.set("page", next.page);
    params.set("pageSize", next.pageSize);

    return `/admin/users-groups?${params.toString()}#users-section`;
  };

  const sortableHeader = (label: string, field: UserSortField) => {
    const active = sortBy === field;
    const nextDir: SortDirection = active && sortDir === "asc" ? "desc" : "asc";
    const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "↕";

    return (
      <Link
        href={buildUsersHref({ sortBy: field, sortDir: nextDir, page: "1" })}
        className="flex min-h-12 items-center gap-1 leading-4 hover:underline"
      >
        <span className="min-w-0">{label}</span>
        <span aria-hidden="true" className="shrink-0">{arrow}</span>
      </Link>
    );
  };

  const pageNumbers = Array.from(
    { length: Math.max(0, Math.min(totalPages, 5)) },
    (_, index) => Math.min(Math.max(1, page - 2) + index, totalPages)
  ).filter((value, index, arr) => value >= 1 && value <= totalPages && arr.indexOf(value) === index);

  const selectedGroup =
    tab === "groups" && selectedGroupId ? groups.find((group) => group.id === selectedGroupId) ?? null : groups[0] ?? null;
  const groupProgressData =
    tab === "groups" && selectedGroup && canViewGroupReports
      ? await getGroupProgressReportData({
          groupId: selectedGroup.id,
          courseId: rawGroupCourseId,
        })
      : null;
  const selectedGroupCourseId = groupProgressData?.courseFilter.selectedCourseId ?? rawGroupCourseId;
  const groupSelectedUserIds = new Set(selectedGroup?.memberships.map((membership) => membership.userId) ?? []);
  const candidateLearners = rawUsers
    .filter((user) => {
      const userRoleNames = [...new Set([...user.userRoles.map((item) => item.roleProfile.name), user.role].filter(Boolean))];
      if (!userRoleNames.includes(STANDARD_ROLE_NAMES.STUDENT)) return false;
      if (isAccessRevokedUserStatus(user.status)) return false;
      if (!groupQuery) return true;
      return [user.name, user.login, user.email ?? ""].some((value) =>
        value.toLowerCase().includes(groupQuery.toLowerCase())
      );
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ru", { sensitivity: "base", numeric: true }));

  const buildGroupsHref = (
    overrides: Partial<{
      groupId: string;
      groupQuery: string;
      groupCourseId: string;
    }> = {}
  ) => {
    const params = new URLSearchParams();
    params.set("tab", "groups");
    const nextGroupId = overrides.groupId ?? (selectedGroup?.id ?? "");
    const nextGroupQuery = overrides.groupQuery ?? groupQuery;
    const nextGroupCourseId = overrides.groupCourseId ?? selectedGroupCourseId;
    if (nextGroupId) params.set("groupId", nextGroupId);
    if (nextGroupQuery) params.set("groupQuery", nextGroupQuery);
    if (nextGroupCourseId) params.set("groupCourseId", nextGroupCourseId);
    return `/admin/users-groups?${params.toString()}#groups-section`;
  };

  const buildGroupProgressExportHref = (format: "csv" | "xlsx") => {
    if (!selectedGroup) return "#";
    const params = new URLSearchParams({
      groupId: selectedGroup.id,
      format,
    });
    if (selectedGroupCourseId) params.set("groupCourseId", selectedGroupCourseId);
    return `/admin/users-groups/groups/export?${params.toString()}`;
  };

  return (
    <main className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        {canEditAccessLevel ? "Управление пользователями" : "Управление учениками"}
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        {canEditAccessLevel
          ? "Управление группами, составом групп и связью пользователей с группами."
          : "Список учеников, их статусы и быстрый переход к созданию нового приглашения."}
      </p>
      <AdminUsersSubtabs active={tab} />

      {tab === "users" ? (
        <section id="users-section" className="mt-6">
          <h2 className="text-lg font-semibold">{canEditAccessLevel ? "Пользователи" : "Ученики"}</h2>
          <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]">
            <div className="border-b border-[var(--line)] p-4">
              {sp.notice ? (
                <div className="mb-4 rounded-md bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]">
                  {sp.notice}
                </div>
              ) : null}
              <form action="/admin/users-groups#users-section" className="grid gap-3 md:grid-cols-6">
                <input type="hidden" name="tab" value="users" />
                <input type="hidden" name="sortBy" value={sortBy} />
                <input type="hidden" name="sortDir" value={sortDir} />
                <input type="hidden" name="page" value="1" />

                <label className="md:col-span-2">
                  <span className="mb-1 block text-xs text-[var(--ink-muted)]">Поиск</span>
                  <Input name="q" defaultValue={q} placeholder="Имя, логин, email" />
                </label>

                <label>
                  <span className="mb-1 block text-xs text-[var(--ink-muted)]">Роль</span>
                  <Select name="role" defaultValue={role}>
                    <option value="">Все роли</option>
                    {visibleRoles.map((item) => (
                      <option key={item.id} value={item.name}>
                        {ROLE_LABELS[item.name] ?? item.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label>
                  <span className="mb-1 block text-xs text-[var(--ink-muted)]">Статус</span>
                  <Select name="status" defaultValue={status}>
                    <option value="">Все статусы</option>
                    <option value={USER_STATUSES.ACTIVE}>{USER_STATUS_LABELS[USER_STATUSES.ACTIVE]}</option>
                    <option value={USER_STATUSES.PENDING}>{USER_STATUS_LABELS[USER_STATUSES.PENDING]}</option>
                    <option value={USER_STATUSES.BLOCKED}>{USER_STATUS_LABELS[USER_STATUSES.BLOCKED]}</option>
                    <option value={USER_STATUSES.ARCHIVED}>{USER_STATUS_LABELS[USER_STATUSES.ARCHIVED]}</option>
                  </Select>
                </label>

                <label>
                  <span className="mb-1 block text-xs text-[var(--ink-muted)]">Дата с</span>
                  <Input name="dateFrom" type="date" defaultValue={dateFrom} />
                </label>

                <label>
                  <span className="mb-1 block text-xs text-[var(--ink-muted)]">Дата по</span>
                  <Input name="dateTo" type="date" defaultValue={dateTo} />
                </label>

                <label>
                  <span className="mb-1 block text-xs text-[var(--ink-muted)]">На странице</span>
                  <Select name="pageSize" defaultValue={String(pageSize)}>
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </Select>
                </label>

                <div className="flex items-end gap-2 md:col-span-2">
                  <Button variant="secondary" type="submit">
                    Применить
                  </Button>
                  <Link
                    href="/admin/users-groups?tab=users#users-section"
                    className={buttonStyles("secondary")}
                  >
                    Сбросить
                  </Link>
                </div>

                <div className="flex items-end justify-end gap-2 md:col-span-6">
                  <Link href="/admin/users/import" className={buttonStyles("secondary")}>
                    Импорт CSV
                  </Link>
                  <Link href="/admin/users/new" className={buttonStyles("primary")}>
                    {canEditAccessLevel ? "Новый пользователь" : "Новый ученик"}
                  </Link>
                </div>
              </form>
            </div>

            <form action={bulkArchiveUsers}>
              {canDeleteUsers ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 text-sm">
                  <p className="text-[var(--ink-muted)]">
                    Отметьте неактуальных пользователей, чтобы архивировать их списком.
                  </p>
                  <Button variant="danger" type="submit">
                    Архивировать выбранных
                  </Button>
                </div>
              ) : null}

              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      {canDeleteUsers ? (
                        <th className="h-12 w-[4%] px-2 py-0 align-middle text-left text-xs font-semibold uppercase leading-4 tracking-wide text-[var(--ink-muted)]" />
                      ) : null}
                      <th className="hidden px-2 py-2 text-left font-semibold text-[var(--ink)]">
                        {sortableHeader("ID", "id")}
                      </th>
                      <th className="h-12 w-[20%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Имя пользователя", "name")}
                      </th>
                      <th className="h-12 w-[20%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Email", "email")}
                      </th>
                      <th className="h-12 w-[9%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Статус", "status")}
                      </th>
                      <th className="h-12 w-[12%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Подразделение", "department")}
                      </th>
                      <th className="h-12 w-[12%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Организация", "organization")}
                      </th>
                      <th className="h-12 w-[6%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Группы", "groups")}
                      </th>
                      <th className="h-12 w-[8%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Дата создания", "createdAt")}
                      </th>
                      <th className="h-12 w-[9%] px-2 py-0 align-middle text-left text-xs font-semibold leading-4 text-[var(--ink)]">
                        {sortableHeader("Последний вход", "lastLoginAt")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      return (
                        <tr key={user.id} className="border-b border-[var(--line)]">
                          {canDeleteUsers ? (
                            <td className="px-2 py-3">
                              <input
                                name="userId"
                                type="checkbox"
                                value={user.id}
                                aria-label={`Выбрать пользователя ${user.name}`}
                              />
                            </td>
                          ) : null}
                          <td className="hidden px-2 py-3 font-mono text-xs text-[var(--ink-muted)]">
                            {user.id}
                          </td>
                          <td className="px-2 py-3">
                            <AdminUserInteractiveCell
                              userId={user.id}
                              name={user.name}
                              login={user.login}
                              avatarUrl={user.avatarUrl}
                              editLabel={canEditAccessLevel ? "Редактировать пользователя" : "Редактировать ученика"}
                            />
                          </td>
                          <td className="break-all px-2 py-3 text-[var(--ink)]">
                            {user.email ?? "Не указан"}
                          </td>
                          <td className="px-2 py-3 text-[var(--ink)]">{user.statusLabel}</td>
                          <td className="px-2 py-3 text-[var(--ink)]">{user.departmentName}</td>
                          <td className="px-2 py-3 text-[var(--ink)]">{user.organizationName}</td>
                          <td className="px-2 py-3 text-[var(--ink)]">{user.groupsCount}</td>
                          <td className="px-2 py-3 text-xs leading-4 text-[var(--ink)]">
                            {formatDate(user.createdAt)}
                          </td>
                          <td className="px-2 py-3 text-xs leading-4 text-[var(--ink)]">
                            {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Не входил"}
                          </td>
                        </tr>
                      );
                    })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={canDeleteUsers ? 10 : 9} className="px-3 py-6 text-center text-[var(--ink-muted)]">
                          Пользователи не найдены.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </form>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-sm">
              <p className="text-[var(--ink-muted)]">
                Показано {(page - 1) * pageSize + (users.length ? 1 : 0)}-{(page - 1) * pageSize + users.length} из {usersTotal}
              </p>
              <div className="flex items-center gap-1">
                {page > 1 ? (
                  <Link
                    href={buildUsersHref({ page: String(page - 1) })}
                    className="rounded-md border border-[var(--line)] px-2 py-1 hover:bg-[var(--accent-soft)]"
                  >
                    Назад
                  </Link>
                ) : (
                  <span className="rounded-md border border-[var(--line)] px-2 py-1 text-[var(--ink-muted)]">Назад</span>
                )}

                {pageNumbers.map((p) =>
                  p === page ? (
                    <span key={p} className="rounded-md bg-[var(--accent)] px-2 py-1 text-white">
                      {p}
                    </span>
                  ) : (
                    <Link
                      key={p}
                      href={buildUsersHref({ page: String(p) })}
                      className="rounded-md border border-[var(--line)] px-2 py-1 hover:bg-[var(--accent-soft)]"
                    >
                      {p}
                    </Link>
                  )
                )}

                {page < totalPages ? (
                  <Link
                    href={buildUsersHref({ page: String(page + 1) })}
                    className="rounded-md border border-[var(--line)] px-2 py-1 hover:bg-[var(--accent-soft)]"
                  >
                    Далее
                  </Link>
                ) : (
                  <span className="rounded-md border border-[var(--line)] px-2 py-1 text-[var(--ink-muted)]">Далее</span>
                )}
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {tab === "groups" ? (
        <section id="groups-section" className="mt-6">
          <h2 className="text-lg font-semibold">Группы</h2>
          <div className="mt-4 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] p-4">
                <p className="max-w-xl text-sm text-[var(--ink-muted)]">
                  Объедините учеников в группы, чтобы массово назначать курсы по отделам и направлениям.
                </p>
                {canCreateGroups ? <AdminCreateGroupModal action={createGroup} /> : null}
              </div>

              <div className="divide-y divide-[var(--line)]">
                {groups.map((group) => {
                  const isSelected = selectedGroup?.id === group.id;
                  return (
                    <Link
                      key={group.id}
                      href={buildGroupsHref({ groupId: group.id })}
                      className={`block px-4 py-4 transition hover:bg-[var(--accent-soft)] ${
                        isSelected ? "bg-[var(--accent-soft)]" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--ink)]">{group.name}</div>
                          <p className="mt-1 text-sm text-[var(--ink-muted)]">
                            {group.description || "Описание пока не заполнено."}
                          </p>
                        </div>
                        <span className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
                          {group._count.memberships}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {groups.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">Группы пока не созданы.</div>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-6">
              {sp.groupNotice ? (
                <div className="mb-4 rounded-md bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]">
                  {sp.groupNotice}
                </div>
              ) : null}
              {sp.groupError ? (
                <div className="mb-4 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                  {sp.groupError}
                </div>
              ) : null}

              {selectedGroup ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-[var(--ink)]">{selectedGroup.name}</h3>
                      <p className="mt-2 text-sm text-[var(--ink-muted)]">
                        В этой карточке можно отредактировать описание группы и собрать список учеников для массовых назначений.
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink-muted)]">
                      Участников: {selectedGroup.memberships.length}
                    </span>
                  </div>

                  <form action={updateGroup.bind(null, selectedGroup.id)} className="grid gap-4 md:grid-cols-2">
                    <input type="hidden" name="groupCourseId" value={selectedGroupCourseId} />
                    <label className="block">
                      <span className="mb-1 block text-sm text-[var(--ink)]">Название группы</span>
                      <input
                        name="name"
                        required
                        defaultValue={selectedGroup.name}
                        disabled={!canEditGroups}
                        className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-sm text-[var(--ink)]">Описание</span>
                      <textarea
                        name="description"
                        rows={3}
                        defaultValue={selectedGroup.description ?? ""}
                        disabled={!canEditGroups}
                        className="w-full rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </label>
                    {canEditGroups ? (
                      <div className="md:col-span-2">
                        <Button variant="secondary" type="submit">
                          Сохранить группу
                        </Button>
                      </div>
                    ) : null}
                  </form>

                  {canViewGroupReports && groupProgressData ? (
                    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-semibold text-[var(--ink)]">Прогресс группы</h4>
                          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">
                            Сводка по обязательным материалам назначенных курсов, сравнение со смежными группами и быстрый экспорт отчета.
                          </p>
                        </div>
                        {groupProgressData.courseFilter.options.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={buildGroupProgressExportHref("csv")}
                              className={buttonStyles("secondary")}
                            >
                              Экспорт CSV
                            </Link>
                            <Link
                              href={buildGroupProgressExportHref("xlsx")}
                              className={buttonStyles("secondary")}
                            >
                              Экспорт Excel
                            </Link>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                          <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Активные ученики</div>
                          <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                            {groupProgressData.summary.learnersCount}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                          <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Курсы в отчете</div>
                          <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                            {groupProgressData.summary.assignedCoursesCount}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                          <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Завершили все</div>
                          <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                            {groupProgressData.summary.completedLearnersCount}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
                          <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Средний прогресс</div>
                          <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                            {formatPercent(groupProgressData.summary.avgProgressPercent)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--ink-muted)]">
                        <span>
                          Место в сравнении:{" "}
                          {groupProgressData.summary.comparisonRank
                            ? `${groupProgressData.summary.comparisonRank} из ${groupProgressData.summary.totalComparedGroups}`
                            : "нет данных"}
                        </span>
                        {groupProgressData.courseFilter.selectedCourseTitle ? (
                          <span>Фильтр по курсу: {groupProgressData.courseFilter.selectedCourseTitle}</span>
                        ) : (
                          <span>Показываем все опубликованные курсы, назначенные этой группе.</span>
                        )}
                      </div>

                      {groupProgressData.courseFilter.options.length > 0 ? (
                        <form action="/admin/users-groups#groups-section" className="mt-5 flex flex-wrap items-end gap-3">
                          <input type="hidden" name="tab" value="groups" />
                          <input type="hidden" name="groupId" value={selectedGroup.id} />
                          <input type="hidden" name="groupQuery" value={groupQuery} />
                          <label className="block">
                            <span className="mb-1 block text-xs text-[var(--ink-muted)]">Курс</span>
                            <select
                              name="groupCourseId"
                              defaultValue={groupProgressData.courseFilter.selectedCourseId}
                              className="h-10 min-w-[260px] rounded-md border border-[var(--line)] px-3 text-sm"
                            >
                              <option value="">Все назначенные курсы</option>
                              {groupProgressData.courseFilter.options.map((course) => (
                                <option key={course.id} value={course.id}>
                                  {course.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button variant="secondary" type="submit">
                            Применить фильтр
                          </Button>
                          <Link
                            href={buildGroupsHref({ groupId: selectedGroup.id, groupCourseId: "" })}
                            className={buttonStyles("secondary")}
                          >
                            Все курсы
                          </Link>
                        </form>
                      ) : (
                        <div className="mt-5 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-4 py-4 text-sm text-[var(--ink-muted)]">
                          У группы пока нет опубликованных курсов в назначениях. Сводка и экспорт появятся после назначения хотя бы одного курса.
                        </div>
                      )}

                      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]">
                          <div className="border-b border-[var(--line)] px-4 py-3">
                            <h5 className="text-base font-semibold text-[var(--ink)]">Ученики группы</h5>
                            <p className="mt-1 text-sm text-[var(--ink-muted)]">
                              {groupProgressData.courseFilter.selectedCourseId
                                ? "Прогресс по выбранному курсу и последняя активность."
                                : "Сводка по всем назначенным курсам с общим статусом прохождения."}
                            </p>
                          </div>
                          <div className="max-w-full overflow-x-auto">
                            <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                              <thead>
                                <tr className="border-b border-[var(--line)]">
                                  <th className="w-[30%] px-3 py-3 text-left font-semibold text-[var(--ink)]">Ученик</th>
                                  <th className="w-[16%] px-3 py-3 text-left font-semibold text-[var(--ink)]">
                                    Подразделение
                                  </th>
                                  {groupProgressData.courseFilter.selectedCourseId ? (
                                    <>
                                      <th className="w-[10%] px-3 py-3 text-left font-semibold text-[var(--ink)]">
                                        Прогресс
                                      </th>
                                      <th className="w-[14%] px-3 py-3 text-left font-semibold text-[var(--ink)]">Статус</th>
                                    </>
                                  ) : (
                                    <>
                                      <th className="w-[10%] px-3 py-3 text-left font-semibold text-[var(--ink)]">Курсы</th>
                                      <th className="w-[14%] px-3 py-3 text-left font-semibold text-[var(--ink)]">
                                        Средний прогресс
                                      </th>
                                      <th className="w-[14%] px-3 py-3 text-left font-semibold text-[var(--ink)]">Статус</th>
                                    </>
                                  )}
                                  <th className="w-[16%] px-3 py-3 text-left font-semibold text-[var(--ink)]">
                                    Последняя активность
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupProgressData.learners.map((learner) => (
                                  <tr key={learner.id} className="border-b border-[var(--line)]">
                                    <td className="px-3 py-3">
                                      <div className="font-medium text-[var(--ink)]">{learner.name}</div>
                                      <div className="mt-1 text-xs leading-4 text-[var(--ink-muted)]">
                                        {learner.login}
                                        {learner.email ? ` · ${learner.email}` : ""}
                                      </div>
                                      {!groupProgressData.courseFilter.selectedCourseId && learner.courseTitles.length > 0 ? (
                                        <div className="mt-1 text-xs leading-4 text-[var(--ink-muted)]">
                                          Курсы: {learner.courseTitles.join(", ")}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-3 text-[var(--ink)]">{learner.departmentName}</td>
                                    {groupProgressData.courseFilter.selectedCourseId ? (
                                      <>
                                        <td className="px-3 py-3 text-[var(--ink)]">
                                          {formatPercent(learner.selectedCourseProgressPercent ?? 0)}
                                        </td>
                                        <td className="px-3 py-3 text-[var(--ink)]">
                                          {learner.selectedCourseStatusLabel ?? learner.statusLabel}
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-3 py-3 text-[var(--ink)]">
                                          {learner.completedCoursesCount} / {learner.assignedCoursesCount}
                                        </td>
                                        <td className="px-3 py-3 text-[var(--ink)]">
                                          {formatPercent(learner.averageProgressPercent)}
                                        </td>
                                        <td className="px-3 py-3 text-[var(--ink)]">{learner.statusLabel}</td>
                                      </>
                                    )}
                                    <td className="px-3 py-3 text-xs leading-4 text-[var(--ink)]">
                                      {learner.lastActivityAt ? formatDateTime(learner.lastActivityAt) : "Нет активности"}
                                    </td>
                                  </tr>
                                ))}
                                {groupProgressData.learners.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={groupProgressData.courseFilter.selectedCourseId ? 5 : 6}
                                      className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]"
                                    >
                                      В группе нет активных учеников, подходящих для отчета.
                                    </td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
                          <h5 className="text-base font-semibold text-[var(--ink)]">Сравнение групп</h5>
                          <p className="mt-1 text-sm text-[var(--ink-muted)]">
                            График среднего прогресса по текущему фильтру. По клику можно переключиться на другую группу.
                          </p>
                          <div className="mt-4 space-y-3">
                            {groupProgressData.comparisonRows.map((row) => {
                              const content = (
                                <div
                                  className={`rounded-xl border px-4 py-3 ${
                                    row.isSelected
                                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                                      : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--accent-soft)]"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="font-medium text-[var(--ink)]">{row.groupName}</div>
                                      <div className="mt-1 text-xs text-[var(--ink-muted)]">
                                        Ученики: {row.learnersCount} · Завершили все: {row.completedLearnersCount}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-lg font-semibold text-[var(--ink)]">
                                        {formatPercent(row.avgProgressPercent)}
                                      </div>
                                      <div className="text-xs text-[var(--ink-muted)]">
                                        Курсы: {row.assignedCoursesCount}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--line)]">
                                    <div
                                      className={`h-full rounded-full ${row.isSelected ? "bg-[var(--accent)]" : "bg-[var(--ink-muted)]"}`}
                                      style={{ width: `${Math.max(0, Math.min(row.avgProgressPercent, 100))}%` }}
                                    />
                                  </div>
                                </div>
                              );

                              return row.isSelected ? (
                                <div key={row.groupId}>{content}</div>
                              ) : (
                                <Link key={row.groupId} href={buildGroupsHref({ groupId: row.groupId })} className="block">
                                  {content}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-semibold text-[var(--ink)]">Состав группы</h4>
                          <p className="mt-1 text-sm text-[var(--ink-muted)]">
                            Выберите учеников из списка. Сохранение заменяет текущий состав группы.
                          </p>
                        </div>
                        <form action="/admin/users-groups#groups-section" className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="tab" value="groups" />
                          <input type="hidden" name="groupId" value={selectedGroup.id} />
                          <input type="hidden" name="groupCourseId" value={selectedGroupCourseId} />
                          <label className="block">
                            <span className="mb-1 block text-xs text-[var(--ink-muted)]">Поиск ученика</span>
                            <input
                              name="groupQuery"
                              defaultValue={groupQuery}
                              placeholder="Имя, логин или email"
                              className="h-10 rounded-md border border-[var(--line)] px-3 text-sm"
                            />
                          </label>
                          <Button variant="secondary" type="submit">
                            Найти
                          </Button>
                          <Link
                            href={buildGroupsHref({ groupId: selectedGroup.id, groupQuery: "" })}
                            className={buttonStyles("secondary")}
                          >
                            Сбросить
                          </Link>
                        </form>
                      </div>

                      <form action={setGroupMembers.bind(null, selectedGroup.id)} className="mt-5 space-y-4">
                        <input type="hidden" name="groupCourseId" value={selectedGroupCourseId} />
                        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]">
                          {candidateLearners.length > 0 ? (
                            <ul className="divide-y divide-[var(--line)]">
                              {candidateLearners.map((learner) => (
                                <li key={learner.id} className="px-4 py-3">
                                  <label className="flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      name="userId"
                                      value={learner.id}
                                      defaultChecked={groupSelectedUserIds.has(learner.id)}
                                      disabled={!canEditGroups}
                                      className="mt-1"
                                    />
                                    <div className="min-w-0">
                                      <div className="font-medium text-[var(--ink)]">{learner.name}</div>
                                      <div className="mt-1 text-xs text-[var(--ink-muted)]">
                                        {learner.login}
                                        {learner.email ? ` · ${learner.email}` : ""}
                                      </div>
                                      <div className="mt-1 text-xs text-[var(--ink-muted)]">
                                        {learner.department?.name ?? "Без подразделения"} ·{" "}
                                        {isUserStatus(learner.status) ? USER_STATUS_LABELS[learner.status] : learner.status}
                                      </div>
                                    </div>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
                              По текущему запросу ученики не найдены.
                            </div>
                          )}
                        </div>

                        {canEditGroups ? (
                          <div className="flex flex-wrap gap-3">
                            <Button variant="primary" type="submit">
                              Сохранить состав группы
                            </Button>
                            <p className="self-center text-xs text-[var(--ink-muted)]">
                              После сохранения эту группу можно выбирать в назначениях курса вместо списка email.
                            </p>
                          </div>
                        ) : null}
                      </form>
                    </div>

                    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
                      <h4 className="text-lg font-semibold text-[var(--ink)]">Текущие участники</h4>
                      {selectedGroup.memberships.length > 0 ? (
                        <ul className="mt-4 space-y-3 text-sm">
                          {selectedGroup.memberships
                            .slice()
                            .sort((left, right) =>
                              left.user.name.localeCompare(right.user.name, "ru", { sensitivity: "base", numeric: true })
                            )
                            .map((membership) => (
                              <li key={membership.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
                                <div className="font-medium text-[var(--ink)]">{membership.user.name}</div>
                                <div className="mt-1 text-xs text-[var(--ink-muted)]">
                                  {membership.user.login}
                                  {membership.user.email ? ` · ${membership.user.email}` : ""}
                                </div>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="mt-4 text-sm text-[var(--ink-muted)]">В группе пока нет учеников.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[var(--ink-muted)]">Создайте первую группу, чтобы назначать в нее учеников.</div>
              )}
            </section>
          </div>
        </section>
      ) : null}
    </main>
  );
}
