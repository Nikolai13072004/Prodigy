"use server";

import bcrypt from "bcryptjs";
import { appBaseUrl } from "@/lib/app-base-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import { isUserAssignedToCourse } from "@/lib/access";
import {
  enqueueCourseAssignedEmails,
  enqueueStudentInviteEmails,
} from "@/lib/email/queue";
import { enqueueUserActivationEmails } from "@/lib/email/queue";
import { enqueueUserAccessEmails } from "@/lib/email/queue";
import {
  generatePasswordForPolicy,
  getPlatformSecuritySettings,
  validatePasswordAgainstPolicy,
} from "@/lib/platform-settings";
import { parseCourseAccessDateInput } from "@/lib/course-access-window";
import prisma from "@/lib/prisma";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import {
  PERMISSIONS,
  STANDARD_ROLE_NAMES,
  hasPermission,
  primaryRole,
} from "@/lib/roles";
import {
  createUserActivationToken,
  userActivationExpiresAt,
} from "@/lib/user-activations";
import { USER_STATUSES, buildUserDisplayName } from "@/lib/users";
import {
  haveRolesChanged,
  isSelfBlockAttempt,
  resolveEditedUserStatus,
} from "@/modules/user/domain/user-profile-update";
import { resolveNewUserAccountPlan } from "@/modules/user/domain/new-user-account";
import { planBulkArchive } from "@/modules/user/domain/bulk-archive";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asOptionalString(formData: FormData, key: string) {
  return asString(formData, key) || null;
}

function asOptionalAvatarUrl(formData: FormData) {
  const value = asString(formData, "avatarUrl");
  if (!value) return null;
  if (/^\/uploads\/user-avatars\/[a-f0-9-]+\.webp$/i.test(value)) return value;
  return "invalid";
}

function collectRoleNames(formData: FormData) {
  return [
    ...new Set(
      formData
        .getAll("role")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function hasCheckedValue(formData: FormData, key: string, value: string) {
  return formData.getAll(key).some((entry) => String(entry).trim() === value);
}

function usersListUrl(notice?: string) {
  const params = new URLSearchParams({ tab: "users" });
  if (notice) params.set("notice", notice);
  return `/admin/users-groups?${params.toString()}#users-section`;
}

type CreateUserDraft = {
  firstName?: string;
  lastName?: string;
  login?: string;
  email?: string;
  role?: string[];
  status?: string;
  groupId?: string;
  departmentId?: string;
  organizationId?: string;
  sendInvite?: "1" | "0";
};

function userEditUrl(
  userId: string,
  params?: Record<string, string | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix
    ? `/admin/users/${userId}/edit?${suffix}`
    : `/admin/users/${userId}/edit`;
}

function buildCreateUserDraftUrl(message: string, draft?: CreateUserDraft) {
  const params = new URLSearchParams({ error: message });
  if (draft?.firstName) params.set("firstName", draft.firstName);
  if (draft?.lastName) params.set("lastName", draft.lastName);
  if (draft?.login) params.set("login", draft.login);
  if (draft?.email) params.set("email", draft.email);
  if (draft?.status) params.set("status", draft.status);
  if (draft?.groupId) params.set("groupId", draft.groupId);
  if (draft?.departmentId) params.set("departmentId", draft.departmentId);
  if (draft?.organizationId) params.set("organizationId", draft.organizationId);
  if (draft?.sendInvite) params.set("sendInvite", draft.sendInvite);

  for (const roleName of draft?.role ?? []) {
    if (roleName) params.append("role", roleName);
  }

  return `/admin/users/new?${params.toString()}`;
}

function redirectCreateError(message: string, draft?: CreateUserDraft): never {
  redirect(buildCreateUserDraftUrl(message, draft));
}

function redirectUserEditError(userId: string, message: string): never {
  redirect(userEditUrl(userId, { error: message }));
}

function asUserEditReturnTab(formData: FormData) {
  const value = asString(formData, "returnTab");
  return value === "personal" ||
    value === "structure" ||
    value === "access" ||
    value === "courses"
    ? value
    : undefined;
}

function roleNamesForUser(user: {
  role: string;
  userRoles: Array<{ roleProfile: { name: string } }>;
}) {
  return [
    ...new Set(
      [
        ...user.userRoles.map((item) => item.roleProfile.name),
        user.role,
      ].filter(Boolean),
    ),
  ];
}

function userHasRoleName(
  user: {
    role: string;
    userRoles: Array<{ roleProfile: { name: string } }>;
  },
  roleName: string,
) {
  return roleNamesForUser(user).includes(roleName);
}

export async function createUser(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_CREATE);
  await ensureSystemRoleProfiles();
  const securitySettings = await getPlatformSecuritySettings();

  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions,
  );
  const plan = resolveNewUserAccountPlan({
    canEditAccessLevel,
    submitModeRaw: asString(formData, "submitMode"),
    sendInviteChecked: hasCheckedValue(formData, "sendInvite", "1"),
    collectedRoles: collectRoleNames(formData),
    statusRaw: asString(formData, "status"),
  });
  const shouldSendInvite = plan.shouldSendInvite;
  const firstName = asString(formData, "firstName");
  const lastName = asOptionalString(formData, "lastName");
  const name = buildUserDisplayName(firstName, lastName);
  const login = asString(formData, "login").toLowerCase();
  const email = asOptionalString(formData, "email");
  const passwordInput = canEditAccessLevel ? asString(formData, "password") : "";
  const password =
    plan.passwordSource === "generate"
      ? generatePasswordForPolicy(securitySettings)
      : passwordInput;
  const roles = plan.roles;
  const role = plan.role;
  const status = plan.status;
  const groupId = asString(formData, "groupId");
  const departmentId = asString(formData, "departmentId");
  const organizationId = asString(formData, "organizationId");
  const createUserDraft: CreateUserDraft = {
    firstName,
    lastName: lastName ?? undefined,
    login,
    email: email ?? undefined,
    role: roles,
    status,
    groupId,
    departmentId,
    organizationId,
    sendInvite: shouldSendInvite ? "1" : "0",
  };

  if (!firstName) redirectCreateError("Имя обязательно", createUserDraft);
  if (!login) redirectCreateError("Логин обязателен", createUserDraft);
  if (!email) redirectCreateError("Email обязателен", createUserDraft);
  if (!password) redirectCreateError("Пароль обязателен", createUserDraft);
  const passwordError = validatePasswordAgainstPolicy(
    password,
    securitySettings,
  );
  if (passwordError) redirectCreateError(passwordError, createUserDraft);
  if (!role) redirectCreateError("Выберите хотя бы одну роль", createUserDraft);

  if (groupId) {
    const groupExists = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!groupExists)
      redirectCreateError("Выбранная группа не существует", createUserDraft);
  }

  if (departmentId) {
    const departmentExists = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!departmentExists)
      redirectCreateError(
        "Выбранное подразделение не существует",
        createUserDraft,
      );
  }

  if (organizationId) {
    const organizationExists = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organizationExists)
      redirectCreateError(
        "Выбранная организация не существует",
        createUserDraft,
      );
  }

  const roleProfiles = await prisma.roleProfile.findMany({
    where: { name: { in: roles } },
    select: { id: true, name: true },
  });
  if (roleProfiles.length !== roles.length) {
    redirectCreateError(
      "Одна или несколько выбранных ролей не существуют",
      createUserDraft,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const activationToken = plan.needsActivationToken ? createUserActivationToken() : null;
  let createdUser: {
    id: string;
    email: string | null;
    login: string;
    name: string;
    firstName: string;
  } | null = null;

  try {
    createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          login,
          email,
          firstName,
          lastName,
          passwordHash,
          role,
          status,
          departmentId: departmentId || null,
          organizationId: organizationId || null,
          userRoles: {
            create: roleProfiles.map((roleProfile) => ({
              roleProfileId: roleProfile.id,
            })),
          },
          groupMemberships: groupId
            ? {
                create: {
                  groupId,
                },
              }
            : undefined,
        },
        select: {
          id: true,
          email: true,
          login: true,
          name: true,
          firstName: true,
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

      return user;
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "P2002") {
      redirectCreateError(
        "Пользователь с таким логином или email уже существует",
        createUserDraft,
      );
    }
    redirectCreateError(
      "Не удалось создать пользователя. Проверьте введенные данные и попробуйте снова.",
      createUserDraft,
    );
  }

  let notice = "Пользователь создан.";

  if (canEditAccessLevel && shouldSendInvite && createdUser?.email) {
    try {
      await enqueueUserActivationEmails([
        {
          email: createdUser.email,
          name: createdUser.name,
              firstName: createdUser.firstName,
          login: createdUser.login,
          activationUrl: `${appBaseUrl()}/activate/${activationToken?.token}`,
        },
      ]);
      notice =
        "Пользователь создан. Письмо со ссылкой для активации поставлено в очередь.";
    } catch (error) {
      console.error("Failed to queue user activation email", error);
      notice =
        "Пользователь создан, но письмо со ссылкой для активации не удалось поставить в очередь.";
    }
  } else if (!canEditAccessLevel && createdUser?.email) {
    if (shouldSendInvite) {
      try {
        await enqueueStudentInviteEmails(
          [
            {
              email: createdUser.email,
              name: createdUser.name,
              firstName: createdUser.firstName,
              login: createdUser.login,
              temporaryPassword: password,
            },
          ],
          { loginUrl: `${appBaseUrl()}/login` },
        );
        notice =
          "Ученик создан. Письмо с временным паролем поставлено в очередь.";
      } catch (error) {
        console.error("Failed to queue student invite email", error);
        notice =
          "Ученик создан, но письмо с временным паролем не удалось поставить в очередь.";
      }
    } else {
      notice = "Ученик создан без отправки письма.";
    }
  }

  if (createdUser) {
    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "users:create",
      objectType: "user",
      objectId: createdUser.id,
      objectLabel: createdUser.name,
      metadata: {
        login: createdUser.login,
        email: createdUser.email,
        roles,
        status,
        groupId: groupId || null,
        departmentId: departmentId || null,
        organizationId: organizationId || null,
        inviteQueued: shouldSendInvite && Boolean(createdUser.email),
      },
    });
  }

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/users/new");
  revalidatePath("/admin/organizations");
  redirect(usersListUrl(notice));
}

export async function deleteUser(userId: string, formData?: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const returnTab = formData ? asUserEditReturnTab(formData) : undefined;

  if (session.user.id === userId) {
    redirect(
      userEditUrl(userId, {
        error: "Нельзя архивировать текущего пользователя.",
        tab: returnTab,
      }),
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, login: true, email: true, name: true, status: true },
  });

  if (!existingUser) {
    redirect(
      userEditUrl(userId, {
        error: "Пользователь не найден.",
        tab: returnTab,
      }),
    );
  }

  if (existingUser.status === USER_STATUSES.ARCHIVED) {
    redirect(
      userEditUrl(existingUser.id, {
        notice: "Пользователь уже архивирован.",
        tab: returnTab,
      }),
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: USER_STATUSES.ARCHIVED,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      },
    });

    await tx.userActivationInvite.updateMany({
      where: {
        userId,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:archive",
    objectType: "user",
    objectId: existingUser.id,
    objectLabel: existingUser.name,
    metadata: {
      login: existingUser.login,
      email: existingUser.email,
      previousStatus: existingUser.status,
      nextStatus: USER_STATUSES.ARCHIVED,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${existingUser.id}/edit`);
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  redirect(usersListUrl("Пользователь архивирован."));
}

export async function restoreUser(userId: string, formData?: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const returnTab = formData ? asUserEditReturnTab(formData) : undefined;

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, login: true, email: true, name: true, status: true },
  });

  if (!existingUser) {
    redirect(usersListUrl("Пользователь не найден."));
  }

  if (existingUser.status !== USER_STATUSES.ARCHIVED) {
    redirect(
      userEditUrl(userId, {
        error: "Восстановить можно только архивированного пользователя.",
        tab: returnTab,
      }),
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      status: USER_STATUSES.ACTIVE,
      failedLoginAttempts: 0,
      loginLockedUntil: null,
    },
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:restore",
    objectType: "user",
    objectId: existingUser.id,
    objectLabel: existingUser.name,
    metadata: {
      login: existingUser.login,
      email: existingUser.email,
      previousStatus: existingUser.status,
      nextStatus: USER_STATUSES.ACTIVE,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${existingUser.id}/edit`);
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  redirect(
    userEditUrl(existingUser.id, {
      notice: "Пользователь восстановлен и снова активен.",
      tab: returnTab,
    }),
  );
}

export async function bulkArchiveUsers(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const selectedUserIds = [
    ...new Set(
      formData
        .getAll("userId")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];

  if (selectedUserIds.length === 0) {
    redirect(usersListUrl("Выберите пользователей для архивирования."));
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: selectedUserIds },
    },
    select: {
      id: true,
      login: true,
      email: true,
      name: true,
      status: true,
    },
  });
  const { skippedCurrentUser, archiveUserIds } = planBulkArchive(users, session.user.id);

  if (archiveUserIds.length === 0) {
    redirect(
      usersListUrl(
        skippedCurrentUser
          ? "Текущего пользователя нельзя архивировать."
          : "Нет пользователей, которых можно архивировать.",
      ),
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: { in: archiveUserIds } },
      data: {
        status: USER_STATUSES.ARCHIVED,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      },
    });

    await tx.userActivationInvite.updateMany({
      where: {
        userId: { in: archiveUserIds },
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });
  });

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:bulk_archive",
    objectType: "user_batch",
    objectLabel: `bulk_archive_${archiveUserIds.length}`,
    metadata: {
      requestedCount: selectedUserIds.length,
      archivedCount: archiveUserIds.length,
      skippedCurrentUser,
      users: users
        .filter((user) => archiveUserIds.includes(user.id))
        .slice(0, 100)
        .map((user) => ({
          id: user.id,
          login: user.login,
          email: user.email,
          previousStatus: user.status,
        })),
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  redirect(
    usersListUrl(
      skippedCurrentUser
        ? `Архивировано пользователей: ${archiveUserIds.length}. Текущий пользователь пропущен.`
        : `Архивировано пользователей: ${archiveUserIds.length}.`,
    ),
  );
}

export async function permanentlyDeleteUser(
  userId: string,
  formData: FormData,
) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const confirmed = asString(formData, "confirmPermanentDelete") === "1";

  if (session.user.id === userId) {
    redirect(
      userEditUrl(userId, { error: "Нельзя удалить текущего пользователя." }),
    );
  }

  if (!confirmed) {
    redirect(
      userEditUrl(userId, {
        error: "Подтвердите окончательное удаление пользователя.",
      }),
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, login: true, email: true, name: true, status: true },
  });

  if (!existingUser) {
    redirect(usersListUrl("Пользователь не найден."));
  }

  if (existingUser.status !== USER_STATUSES.ARCHIVED) {
    redirect(
      userEditUrl(userId, {
        error:
          "Окончательно удалить можно только архивированного пользователя.",
      }),
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (existingUser.email) {
        await tx.emailJob.deleteMany({
          where: {
            toEmail: existingUser.email,
            status: { in: ["PENDING", "PROCESSING", "FAILED"] },
          },
        });

        await tx.courseInvite.deleteMany({
          where: {
            email: existingUser.email,
          },
        });
      }

      await tx.courseInvite.deleteMany({
        where: {
          acceptedUserId: userId,
        },
      });

      await tx.user.delete({
        where: { id: userId },
      });
    });
  } catch (error) {
    console.error("Failed to permanently delete user", error);
    redirect(
      userEditUrl(userId, {
        error:
          "Не удалось окончательно удалить пользователя. Проверьте связанные данные и попробуйте снова.",
      }),
    );
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:delete_permanently",
    objectType: "user",
    objectId: existingUser.id,
    objectLabel: existingUser.name,
    metadata: {
      login: existingUser.login,
      email: existingUser.email,
      previousStatus: existingUser.status,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${existingUser.id}/edit`);
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  redirect(
    usersListUrl(
      "Пользователь удален окончательно. Логин и email можно использовать повторно.",
    ),
  );
}

export async function updateUser(userId: string, formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_PROFILE);
  await ensureSystemRoleProfiles();
  const securitySettings = await getPlatformSecuritySettings();

  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions,
  );
  const firstName = asString(formData, "firstName");
  const lastName = asOptionalString(formData, "lastName");
  const name = buildUserDisplayName(firstName, lastName);
  const loginInput = asString(formData, "login").toLowerCase();
  const email = asOptionalString(formData, "email");
  const password = asString(formData, "password");
  const passwordConfirm = asString(formData, "passwordConfirm");
  const groupId = asString(formData, "groupId");
  const departmentId = asString(formData, "departmentId");
  const organizationId = asString(formData, "organizationId");
  const avatarUrl = asOptionalAvatarUrl(formData);
  const statusRaw = asString(formData, "status");
  const statusControl = asString(formData, "statusControl");
  const returnTab = asUserEditReturnTab(formData);
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
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
      groupMemberships: {
        select: {
          groupId: true,
        },
      },
      userRoles: {
        include: {
          roleProfile: {
            select: { name: true },
          },
        },
      },
    },
  });
  if (!currentUser) {
    redirect(usersListUrl("Пользователь не найден."));
  }

  const login = canEditAccessLevel ? loginInput : currentUser.login;

  if (!firstName) redirectUserEditError(userId, "Имя обязательно");
  if (!login) redirectUserEditError(userId, "Логин обязателен");
  if (avatarUrl === "invalid")
    redirectUserEditError(userId, "Некорректный адрес аватара");

  const currentRoles = roleNamesForUser(currentUser);
  if (
    !canEditAccessLevel &&
    !userHasRoleName(currentUser, STANDARD_ROLE_NAMES.STUDENT)
  ) {
    redirectUserEditError(userId, "HR может редактировать только учеников.");
  }

  const roles = canEditAccessLevel ? collectRoleNames(formData) : currentRoles;
  const role = primaryRole(roles) ?? currentUser.role;
  const status = resolveEditedUserStatus({
    canEditAccessLevel,
    statusControl,
    currentStatus: currentUser.status,
    activeUserChecked: hasCheckedValue(formData, "activeUser", "1"),
    statusRaw,
  });

  if (
    isSelfBlockAttempt({
      sessionUserId: session.user.id,
      targetUserId: userId,
      nextStatus: status,
      currentStatus: currentUser.status,
    })
  ) {
    redirectUserEditError(userId, "Нельзя заблокировать текущего пользователя");
  }

  if (!role) redirectUserEditError(userId, "Выберите хотя бы одну роль");

  const roleProfiles = await prisma.roleProfile.findMany({
    where: { name: { in: roles } },
    select: { id: true, name: true },
  });
  if (roleProfiles.length !== roles.length) {
    redirectUserEditError(
      userId,
      "Одна или несколько выбранных ролей не существуют",
    );
  }

  const rolesChanged = haveRolesChanged(currentRoles, roles);

  if (rolesChanged) {
    await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  }

  if (!canEditAccessLevel && (password || passwordConfirm)) {
    redirectUserEditError(userId, "Недостаточно прав для изменения пароля");
  }

  if (canEditAccessLevel && (password || passwordConfirm)) {
    if (currentUser.status === USER_STATUSES.ARCHIVED) {
      redirectUserEditError(
        userId,
        "Нельзя менять пароль архивного пользователя",
      );
    }
    if (!password || !passwordConfirm) {
      redirectUserEditError(userId, "Введите новый пароль и подтверждение");
    }
    if (password !== passwordConfirm) {
      redirectUserEditError(userId, "Пароли не совпадают");
    }

    const passwordError = validatePasswordAgainstPolicy(
      password,
      securitySettings,
    );
    if (passwordError) redirectUserEditError(userId, passwordError);
  }

  if (groupId) {
    const groupExists = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!groupExists)
      redirectUserEditError(userId, "Выбранная группа не существует");
  }

  if (departmentId) {
    const departmentExists = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!departmentExists)
      redirectUserEditError(userId, "Выбранное подразделение не существует");
  }

  if (organizationId) {
    const organizationExists = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organizationExists)
      redirectUserEditError(userId, "Выбранная организация не существует");
  }

  const passwordHash =
    canEditAccessLevel && password ? await bcrypt.hash(password, 10) : null;
  const passwordUpdated = Boolean(passwordHash);

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          name,
          firstName,
          lastName,
          login,
          email,
          avatarUrl,
          role,
          status,
          departmentId: departmentId || null,
          organizationId: organizationId || null,
          ...(passwordHash ? { passwordHash } : {}),
        },
      }),
      ...(passwordUpdated
        ? [
            prisma.passwordResetToken.updateMany({
              where: { userId, status: "PENDING" },
              data: { status: "CANCELLED" },
            }),
          ]
        : []),
      prisma.userRole.deleteMany({ where: { userId } }),
      ...roleProfiles.map((roleProfile) =>
        prisma.userRole.create({
          data: {
            userId,
            roleProfileId: roleProfile.id,
          },
        }),
      ),
      prisma.groupMembership.deleteMany({ where: { userId } }),
      ...(groupId
        ? [
            prisma.groupMembership.create({
              data: { userId, groupId },
            }),
          ]
        : []),
    ]);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "P2002") {
      redirectUserEditError(
        userId,
        "Пользователь с таким логином или email уже существует",
      );
    }

    console.error("Failed to update user", error);
    redirectUserEditError(
      userId,
      "Не удалось сохранить изменения. Попробуйте еще раз.",
    );
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:update",
    objectType: "user",
    objectId: userId,
    objectLabel: name,
    metadata: {
      previous: {
        name: currentUser.name,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        login: currentUser.login,
        email: currentUser.email,
        avatarUrl: currentUser.avatarUrl,
        roles: currentRoles,
        status: currentUser.status,
        departmentId: currentUser.departmentId,
        organizationId: currentUser.organizationId,
        groupIds: currentUser.groupMemberships.map(
          (membership) => membership.groupId,
        ),
      },
      next: {
        firstName,
        lastName,
        name,
        login,
        email,
        avatarUrl,
        roles,
        status,
        departmentId: departmentId || null,
        organizationId: organizationId || null,
        groupIds: groupId ? [groupId] : [],
      },
      passwordUpdated,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  revalidatePath(`/admin/users/${userId}/edit`);
  const notice = canEditAccessLevel
    ? passwordUpdated
      ? "Пользователь обновлен. Пароль изменен."
      : "Пользователь обновлен."
    : "Профиль ученика обновлен.";

  if (returnTab === "personal") {
    redirect(usersListUrl(notice));
  }

  redirect(
    userEditUrl(userId, {
      notice,
      tab: returnTab,
    }),
  );
}

export async function assignCourseToUserFromProfile(
  userId: string,
  formData: FormData,
) {
  const session = await requirePermission(PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS);
  const courseId = asString(formData, "courseId");
  const rawExpiresOn = asString(formData, "accessExpiresOn");

  const coursesTabUrl = (params?: Record<string, string | undefined>) =>
    userEditUrl(userId, { tab: "courses", ...params });

  if (!courseId) {
    redirect(coursesTabUrl({ error: "Выберите курс для назначения." }));
  }

  const accessExpiresAt = rawExpiresOn
    ? parseCourseAccessDateInput(rawExpiresOn)
    : null;
  if (rawExpiresOn && !accessExpiresAt) {
    redirect(coursesTabUrl({ error: "Не удалось распознать срок выполнения." }));
  }
  if (accessExpiresAt && accessExpiresAt.getTime() <= Date.now()) {
    redirect(
      coursesTabUrl({
        error: "Срок выполнения должен быть позже текущего момента.",
      }),
    );
  }

  const [user, course] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, firstName: true, email: true, status: true },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true },
    }),
  ]);

  if (!user) {
    redirect(usersListUrl("Пользователь не найден."));
  }
  if (user.status === USER_STATUSES.ARCHIVED) {
    redirect(coursesTabUrl({ error: "Нельзя назначить курс архивному пользователю." }));
  }
  if (!course || course.status !== "PUBLISHED") {
    redirect(
      coursesTabUrl({
        error: "Для назначения доступны только опубликованные неархивные курсы.",
      }),
    );
  }

  const isAlreadyAssigned = await isUserAssignedToCourse(userId, courseId);
  if (isAlreadyAssigned) {
    redirect(coursesTabUrl({ notice: "Курс уже назначен пользователю." }));
  }

  const assignedAt = new Date();
  await prisma.courseUserAssignment.upsert({
    where: {
      courseId_userId: {
        courseId,
        userId,
      },
    },
    create: {
      courseId,
      userId,
      assignedById: session.user.id,
      assignedAt,
      expiresAt: accessExpiresAt,
    },
    update: {
      assignedById: session.user.id,
      assignedAt,
      expiresAt: accessExpiresAt,
    },
  });

  if (user.email && user.status === USER_STATUSES.ACTIVE) {
    try {
      await enqueueCourseAssignedEmails(
        [{ email: user.email, name: user.name, firstName: user.firstName }],
        {
          courseTitle: course.title,
          courseUrl: `${appBaseUrl()}/courses/${course.id}`,
          accessExpiresAt,
        },
      );
    } catch (error) {
      console.error("Failed to queue course assignment email", error);
    }
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "courses:assign",
    objectType: "course",
    objectId: course.id,
    objectLabel: course.title,
    metadata: {
      source: "user_profile",
      directUserIds: [userId],
      accessExpiresAt,
    },
  });

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${userId}/edit`);
  revalidatePath(`/admin/reports/${userId}`);
  revalidatePath(`/courses/${course.id}`);
  revalidatePath(`/courses/${course.id}/learners`);
  redirect(coursesTabUrl({ notice: "Курс назначен пользователю." }));
}

export async function resetUserPassword(userId: string) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
  await ensureSystemRoleProfiles();
  const securitySettings = await getPlatformSecuritySettings();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      login: true,
      name: true,
      firstName: true,
    },
  });

  if (!user) {
    redirect(usersListUrl("Пользователь не найден."));
  }

  if (!user.email) {
    redirect(
      userEditUrl(user.id, {
        error: "У пользователя не указан email для отправки временного пароля.",
      }),
    );
  }

  const temporaryPassword = generatePasswordForPolicy(securitySettings);
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, failedLoginAttempts: 0, loginLockedUntil: null },
  });
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });


  let notice = "Временный пароль сохранен и поставлен в очередь на отправку.";

  try {
    await enqueueUserAccessEmails(
      [
        {
          email: user.email,
          name: user.name,
          firstName: user.firstName,
          login: user.login,
          temporaryPassword,
        },
      ],
      {
        loginUrl: `${appBaseUrl()}/login`,
        reason: "PASSWORD_RESET",
      },
    );
  } catch (error) {
    console.error("Failed to queue password reset email", error);
    notice =
      "Пароль обновлен, но письмо с временным паролем не удалось поставить в очередь.";
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:reset_password",
    objectType: "user",
    objectId: user.id,
    objectLabel: user.name,
    metadata: {
      login: user.login,
      email: user.email,
      inviteQueued: notice.includes("поставлен"),
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${user.id}/edit`);
  redirect(userEditUrl(user.id, { notice }));
}

export async function sendUserInvite(userId: string) {
  const session = await requirePermission(PERMISSIONS.USERS_EDIT_PROFILE);
  await ensureSystemRoleProfiles();
  const securitySettings = await getPlatformSecuritySettings();
  const canEditAccessLevel = hasPermission(
    session.user.roles,
    PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
    session.user.permissions,
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      login: true,
      name: true,
      role: true,
      firstName: true,
      status: true,
      userRoles: {
        select: {
          roleProfile: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!user) {
    redirect(usersListUrl("Пользователь не найден."));
  }

  if (
    !canEditAccessLevel &&
    !userHasRoleName(user, STANDARD_ROLE_NAMES.STUDENT)
  ) {
    redirect(
      usersListUrl(
        "Недостаточно прав для отправки приглашения этому пользователю.",
      ),
    );
  }

  if (user.status === USER_STATUSES.ARCHIVED) {
    redirect(
      userEditUrl(user.id, {
        error: "Нельзя отправить приглашение архивированному пользователю.",
      }),
    );
  }

  if (!user.email) {
    redirect(
      userEditUrl(user.id, {
        error: "У пользователя не указан email для отправки приглашения.",
      }),
    );
  }

  const temporaryPassword = generatePasswordForPolicy(securitySettings);
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, failedLoginAttempts: 0, loginLockedUntil: null },
  });
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });


  let notice = "Приглашение отправлено: временный пароль поставлен в очередь.";

  try {
    await enqueueUserAccessEmails(
      [
        {
          email: user.email,
          name: user.name,
          firstName: user.firstName,
          login: user.login,
          temporaryPassword,
        },
      ],
      {
        loginUrl: `${appBaseUrl()}/login`,
        reason: "ACCOUNT_CREATED",
      },
    );
  } catch (error) {
    console.error("Failed to queue user invite email", error);
    notice =
      "Пользователь обновлен, но приглашение с временным паролем не удалось поставить в очередь.";
  }

  await recordAuditEvent({
    actor: auditActorFromSessionUser(session.user),
    action: "users:send_invite",
    objectType: "user",
    objectId: user.id,
    objectLabel: user.name,
    metadata: {
      login: user.login,
      email: user.email,
      inviteQueued: notice.includes("поставлен"),
      byHrManager: !canEditAccessLevel,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${user.id}/edit`);
  redirect(userEditUrl(user.id, { notice }));
}
