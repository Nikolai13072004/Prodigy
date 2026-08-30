"use server";

import bcrypt from "bcryptjs";
import { appBaseUrl } from "@/lib/app-base-url";
import { revalidatePath } from "next/cache";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { requirePermission } from "@/lib/auth-guards";
import { enqueueStudentInviteEmails, enqueueUserActivationEmails } from "@/lib/email/queue";
import { generatePasswordForPolicy, getPlatformSecuritySettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { PERMISSIONS, STANDARD_ROLE_NAMES, hasPermission, primaryRole } from "@/lib/roles";
import { buildUserCsvImportDraft, type UserCsvImportDraftRow } from "@/lib/user-csv-import";
import { createUserActivationToken, userActivationExpiresAt } from "@/lib/user-activations";
import { USER_STATUSES } from "@/lib/users";
import type { UserCsvImportActionState, UserCsvImportResultRow } from "@/app/admin/users/import/user-csv-import-state";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function toErrorRow(row: UserCsvImportDraftRow, detail: string): UserCsvImportResultRow {
  return {
    rowNumber: row.rowNumber,
    name: row.name,
    email: row.email,
    login: row.login,
    roles: row.roles,
    status: "error",
    detail,
  };
}

function buildRowDetail(canEditAccessLevel: boolean, emailQueued: boolean) {
  if (canEditAccessLevel) {
    return emailQueued
      ? "Пользователь создан, письмо со ссылкой активации поставлено в очередь."
      : "Пользователь создан, но письмо со ссылкой активации не удалось поставить в очередь.";
  }

  return emailQueued
    ? "Ученик создан, письмо с временным паролем поставлено в очередь."
    : "Ученик создан, но письмо с временным паролем не удалось поставить в очередь.";
}

function createAvailableLogin(baseLogin: string, occupiedLogins: Set<string>) {
  if (!occupiedLogins.has(baseLogin)) {
    occupiedLogins.add(baseLogin);
    return baseLogin;
  }

  let attempt = 2;
  while (attempt < 10_000) {
    const suffix = `-${attempt}`;
    const truncatedBase = baseLogin.slice(0, Math.max(1, 48 - suffix.length));
    const candidate = `${truncatedBase}${suffix}`;
    if (!occupiedLogins.has(candidate)) {
      occupiedLogins.add(candidate);
      return candidate;
    }
    attempt += 1;
  }

  throw new Error(`Не удалось подобрать свободный логин для ${baseLogin}.`);
}

function buildActionState(args: {
  status: UserCsvImportActionState["status"];
  message: string;
  totalRows: number;
  importedCount: number;
  queuedEmailsCount: number;
  rows: UserCsvImportResultRow[];
}): UserCsvImportActionState {
  return {
    status: args.status,
    message: args.message,
    summary: {
      totalRows: args.totalRows,
      importedCount: args.importedCount,
      errorCount: args.rows.filter((row) => row.status === "error").length,
      queuedEmailsCount: args.queuedEmailsCount,
    },
    rows: [...args.rows].sort((left, right) => left.rowNumber - right.rowNumber),
  };
}

type PreparedImportRow = {
  draft: UserCsvImportDraftRow;
  login: string;
  roleProfileIds: string[];
  groupId: string | null;
  departmentId: string | null;
  organizationId: string | null;
};

export async function importUsersFromCsv(
  _prevState: UserCsvImportActionState,
  formData: FormData
): Promise<UserCsvImportActionState> {
  const session = await requirePermission(PERMISSIONS.USERS_CREATE);
  await ensureSystemRoleProfiles();
  const securitySettings = await getPlatformSecuritySettings();
  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions
  );
  const csvContent = asString(formData, "csvContent");

  const [roleProfiles, groups, departments, organizations, existingUsers] = await Promise.all([
    prisma.roleProfile.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
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
    prisma.user.findMany({
      select: {
        email: true,
        login: true,
      },
    }),
  ]);

  const draft = buildUserCsvImportDraft({
    csvText: csvContent,
    canEditAccessLevel,
    roleNames: roleProfiles.map((role) => role.name),
    groupNames: groups.map((group) => group.name),
    departmentNames: departments.map((department) => department.name),
    organizationNames: organizations.map((organization) => organization.name),
  });

  if (draft.issues.length > 0) {
    return buildActionState({
      status: "error",
      message: draft.issues.join(" "),
      totalRows: draft.summary.totalRows,
      importedCount: 0,
      queuedEmailsCount: 0,
      rows: draft.rows.map((row) => toErrorRow(row, row.issues.join(" "))).filter((row) => row.detail),
    });
  }

  if (draft.rows.length === 0) {
    return buildActionState({
      status: "error",
      message: "CSV не содержит строк для импорта.",
      totalRows: 0,
      importedCount: 0,
      queuedEmailsCount: 0,
      rows: [],
    });
  }

  const roleProfileIdByName = new Map(roleProfiles.map((role) => [role.name, role.id]));
  const groupIdByName = new Map(groups.map((group) => [group.name, group.id]));
  const departmentIdByName = new Map(departments.map((department) => [department.name, department.id]));
  const organizationIdByName = new Map(organizations.map((organization) => [organization.name, organization.id]));
  const occupiedEmails = new Set(existingUsers.map((user) => user.email?.toLowerCase()).filter(Boolean));
  const occupiedLogins = new Set(existingUsers.map((user) => user.login.toLowerCase()));

  const resultRows: UserCsvImportResultRow[] = [];
  const preparedRows: PreparedImportRow[] = [];

  for (const row of draft.rows) {
    if (row.issues.length > 0) {
      resultRows.push(toErrorRow(row, row.issues.join(" ")));
      continue;
    }

    if (occupiedEmails.has(row.email)) {
      resultRows.push(toErrorRow(row, "Пользователь с таким email уже существует."));
      continue;
    }

    const roleProfileIds = row.roles.map((roleName) => roleProfileIdByName.get(roleName) ?? null);
    if (roleProfileIds.some((roleId) => !roleId)) {
      resultRows.push(toErrorRow(row, "Одна или несколько ролей больше не существуют в системе."));
      continue;
    }

    let login = row.login.toLowerCase();
    if (row.loginSource === "provided") {
      if (occupiedLogins.has(login)) {
        resultRows.push(toErrorRow(row, "Пользователь с таким логином уже существует."));
        continue;
      }
      occupiedLogins.add(login);
    } else {
      try {
        login = createAvailableLogin(login, occupiedLogins);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Не удалось подобрать свободный логин.";
        resultRows.push(toErrorRow(row, message));
        continue;
      }
    }

    occupiedEmails.add(row.email);
    preparedRows.push({
      draft: row,
      login,
      roleProfileIds: roleProfileIds.filter((roleId): roleId is string => Boolean(roleId)),
      groupId: row.groupName ? (groupIdByName.get(row.groupName) ?? null) : null,
      departmentId: row.departmentName ? (departmentIdByName.get(row.departmentName) ?? null) : null,
      organizationId: row.organizationName ? (organizationIdByName.get(row.organizationName) ?? null) : null,
    });
  }

  if (preparedRows.length === 0) {
    return buildActionState({
      status: "error",
      message: "Импорт не создал ни одной записи. Исправьте ошибки в CSV и попробуйте снова.",
      totalRows: draft.summary.totalRows,
      importedCount: 0,
      queuedEmailsCount: 0,
      rows: resultRows,
    });
  }

  let createdRows: Array<{
    id: string;
    rowNumber: number;
    name: string;
        firstName: string;
    email: string;
    login: string;
    roles: string[];
    activationUrl: string | null;
    temporaryPassword: string | null;
  }> = [];

  try {
    createdRows = await prisma.$transaction(async (tx) => {
      const created: Array<{
        id: string;
        rowNumber: number;
        name: string;
        firstName: string;
        email: string;
        login: string;
        roles: string[];
        activationUrl: string | null;
        temporaryPassword: string | null;
      }> = [];

      for (const row of preparedRows) {
        const temporaryPassword = generatePasswordForPolicy(securitySettings);
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);
        const activationToken = canEditAccessLevel ? createUserActivationToken() : null;
        const role = primaryRole(row.draft.roles) ?? STANDARD_ROLE_NAMES.STUDENT;

        const user = await tx.user.create({
          data: {
            name: row.draft.name,
            firstName: row.draft.firstName,
            lastName: row.draft.lastName,
            login: row.login,
            email: row.draft.email,
            passwordHash,
            role,
            status: canEditAccessLevel ? USER_STATUSES.PENDING : USER_STATUSES.ACTIVE,
            departmentId: row.departmentId,
            organizationId: row.organizationId,
            userRoles: {
              create: row.roleProfileIds.map((roleProfileId) => ({
                roleProfileId,
              })),
            },
            groupMemberships: row.groupId
              ? {
                  create: {
                    groupId: row.groupId,
                  },
                }
              : undefined,
          },
          select: {
            id: true,
            name: true,
            email: true,
            firstName: true,
            login: true,
          },
        });

        if (activationToken && user.email) {
          await tx.userActivationInvite.create({
            data: {
              userId: user.id,
              email: user.email,
              tokenHash: activationToken.tokenHash,
              invitedById: session.user.id,
              expiresAt: userActivationExpiresAt(securitySettings.userActivationInviteTtlDays),
            },
          });
        }

        created.push({
          id: user.id,
          rowNumber: row.draft.rowNumber,
          name: user.name,
          email: user.email ?? row.draft.email,
          firstName: user.firstName,
          login: user.login,
          roles: row.draft.roles,
          activationUrl: activationToken ? `${appBaseUrl()}/activate/${activationToken.token}` : null,
          temporaryPassword: canEditAccessLevel ? null : temporaryPassword,
        });
      }

      return created;
    });
  } catch (error) {
    console.error("Failed to import users from CSV", error);
    return buildActionState({
      status: "error",
      message: "Не удалось применить импорт. Проверьте данные и попробуйте снова.",
      totalRows: draft.summary.totalRows,
      importedCount: 0,
      queuedEmailsCount: 0,
      rows: [
        ...resultRows,
        ...preparedRows.map((row) =>
          toErrorRow(row.draft, "Импорт прерван до сохранения. Повторите попытку после проверки данных.")
        ),
      ],
    });
  }

  let emailsQueued = false;
  if (createdRows.length > 0) {
    try {
      if (canEditAccessLevel) {
        await enqueueUserActivationEmails(
          createdRows.map((row) => ({
            email: row.email,
            name: row.name,
            firstName: row.firstName,
            login: row.login,
            activationUrl: row.activationUrl ?? `${appBaseUrl()}/login`,
          }))
        );
      } else {
        await enqueueStudentInviteEmails(
          createdRows.map((row) => ({
            email: row.email,
            name: row.name,
            firstName: row.firstName,
            login: row.login,
            temporaryPassword: row.temporaryPassword ?? generatePasswordForPolicy(securitySettings),
          })),
          { loginUrl: `${appBaseUrl()}/login` }
        );
      }
      emailsQueued = true;
    } catch (error) {
      console.error("Failed to queue CSV import emails", error);
    }

    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "users:import_csv",
      objectType: "user_import_batch",
      objectLabel: `csv_import_${createdRows.length}`,
      metadata: {
        importedCount: createdRows.length,
        errorCount: resultRows.filter((row) => row.status === "error").length,
        canEditAccessLevel,
        invitedCount: emailsQueued ? createdRows.length : 0,
        importedUsers: createdRows.slice(0, 100).map((row) => ({
          id: row.id,
          rowNumber: row.rowNumber,
          login: row.login,
          email: row.email,
          roles: row.roles,
        })),
      },
    });
  }

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/users/new");
  revalidatePath("/admin/users/import");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");

  const importedResultRows = createdRows.map((row) => ({
    rowNumber: row.rowNumber,
    name: row.name,
    email: row.email,
    login: row.login,
    roles: row.roles,
    status: "imported" as const,
    detail: buildRowDetail(canEditAccessLevel, emailsQueued),
  }));
  const allRows = [...resultRows, ...importedResultRows];
  const errorCount = allRows.filter((row) => row.status === "error").length;
  const importedCount = importedResultRows.length;

  return buildActionState({
    status: errorCount > 0 && importedCount === 0 ? "error" : "success",
    message:
      importedCount > 0
        ? errorCount > 0
          ? `Импорт завершен частично: создано ${importedCount}, ошибок ${errorCount}.`
          : `Импорт завершен: создано ${importedCount}.`
        : "Импорт не создал ни одной записи.",
    totalRows: draft.summary.totalRows,
    importedCount,
    queuedEmailsCount: emailsQueued ? importedCount : 0,
    rows: allRows,
  });
}
