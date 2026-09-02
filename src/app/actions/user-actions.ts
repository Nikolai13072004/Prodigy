"use server";

import { appBaseUrl } from "@/lib/app-base-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth-guards";
import {
  auditActorFromSessionUser,
  getAuditRequestContext,
  recordAuditEvent,
} from "@/lib/audit-log";
import {
  enqueueCourseAssignedEmails,
  enqueueStudentInviteEmails,
} from "@/lib/email/queue";
import { enqueueUserActivationEmails } from "@/lib/email/queue";
import { enqueueUserAccessEmails } from "@/lib/email/queue";
import {
  generatePasswordForPolicy,
  getPlatformSecuritySettings,
} from "@/lib/platform-settings";
import { parseCourseAccessDateInput } from "@/lib/course-access-window";
import { ensureSystemRoleProfiles } from "@/lib/role-profiles";
import { PERMISSIONS, hasPermission } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";
import { resolveNewUserAccountPlan } from "@/modules/user/domain/new-user-account";
import { UserApplicationError } from "@/modules/user/application/errors";
import {
  archiveUser as archiveUserUseCase,
  bulkArchiveUsers as bulkArchiveUsersUseCase,
  permanentlyDeleteUser as permanentlyDeleteUserUseCase,
  restoreUser as restoreUserUseCase,
} from "@/modules/user/server/lifecycle";
import { updateUserProfile as updateUserProfileUseCase } from "@/modules/user/server/profile";
import { createUserAccount as createUserAccountUseCase } from "@/modules/user/server/creation";
import {
  resetUserPassword as resetUserPasswordUseCase,
  sendUserInvite as sendUserInviteUseCase,
} from "@/modules/user/server/credentials";
import { EnrollmentApplicationError } from "@/modules/enrollment/application/errors";
import { assignCourseToLearner as assignCourseToLearnerUseCase } from "@/modules/enrollment/server/learner-access";

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

  const firstName = asString(formData, "firstName");
  const lastName = asOptionalString(formData, "lastName");
  const login = asString(formData, "login").toLowerCase();
  const email = asOptionalString(formData, "email");
  const groupId = asString(formData, "groupId");
  const departmentId = asString(formData, "departmentId");
  const organizationId = asString(formData, "organizationId");
  const passwordInput = canEditAccessLevel ? asString(formData, "password") : "";
  const password =
    plan.passwordSource === "generate"
      ? generatePasswordForPolicy(securitySettings)
      : passwordInput;

  const createUserDraft: CreateUserDraft = {
    firstName,
    lastName: lastName ?? undefined,
    login,
    email: email ?? undefined,
    role: plan.roles,
    status: plan.status,
    groupId,
    departmentId,
    organizationId,
    sendInvite: plan.shouldSendInvite ? "1" : "0",
  };

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await createUserAccountUseCase({
      actor: { id: actor.id, login: actor.login, name: actor.name },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
      fields: {
        firstName,
        lastName,
        login,
        email,
        departmentId,
        organizationId,
        groupId,
      },
      plan: {
        roles: plan.roles,
        role: plan.role,
        status: plan.status,
        password,
        needsActivationToken: plan.needsActivationToken,
        shouldSendInvite: plan.shouldSendInvite,
      },
      security: securitySettings,
    });
  } catch (error) {
    if (error instanceof UserApplicationError) {
      redirectCreateError(error.message, createUserDraft);
    }
    console.error("Failed to create user", error);
    redirectCreateError(
      "Не удалось создать пользователя. Проверьте введенные данные и попробуйте снова.",
      createUserDraft,
    );
  }

  const createdUser = result.user;
  const activationToken = result.activationToken;
  let notice = "Пользователь создан.";

  if (canEditAccessLevel && plan.shouldSendInvite && createdUser.email && activationToken) {
    try {
      await enqueueUserActivationEmails([
        {
          email: createdUser.email,
          name: createdUser.name,
          firstName: createdUser.firstName,
          login: createdUser.login,
          activationUrl: `${appBaseUrl()}/activate/${activationToken.token}`,
        },
      ]);
      notice =
        "Пользователь создан. Письмо со ссылкой для активации поставлено в очередь.";
    } catch (error) {
      console.error("Failed to queue user activation email", error);
      notice =
        "Пользователь создан, но письмо со ссылкой для активации не удалось поставить в очередь.";
    }
  } else if (!canEditAccessLevel && createdUser.email) {
    if (plan.shouldSendInvite) {
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

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/users/new");
  revalidatePath("/admin/organizations");
  redirect(usersListUrl(notice));
}

export async function deleteUser(userId: string, formData?: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const returnTab = formData ? asUserEditReturnTab(formData) : undefined;
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await archiveUserUseCase({
      userId,
      currentUserId: session.user.id,
      audit: {
        actorId: actor.id,
        actorLogin: actor.login,
        actorName: actor.name,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof UserApplicationError) {
      if (error.code === "ALREADY_ARCHIVED") {
        redirect(
          userEditUrl(userId, {
            notice: error.message,
            tab: returnTab,
          }),
        );
      }
      redirect(
        userEditUrl(userId, {
          error: error.message,
          tab: returnTab,
        }),
      );
    }
    throw error;
  }

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${result.user.id}/edit`);
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  redirect(usersListUrl("Пользователь архивирован."));
}

export async function restoreUser(userId: string, formData?: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const returnTab = formData ? asUserEditReturnTab(formData) : undefined;
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await restoreUserUseCase({
      userId,
      audit: {
        actorId: actor.id,
        actorLogin: actor.login,
        actorName: actor.name,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof UserApplicationError) {
      if (error.code === "NOT_FOUND") {
        redirect(usersListUrl(error.message));
      }
      redirect(
        userEditUrl(userId, {
          error: error.message,
          tab: returnTab,
        }),
      );
    }
    throw error;
  }

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${result.user.id}/edit`);
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  redirect(
    userEditUrl(result.user.id, {
      notice: "Пользователь восстановлен и снова активен.",
      tab: returnTab,
    }),
  );
}

export async function bulkArchiveUsers(formData: FormData) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const selectedUserIds = formData
    .getAll("userId")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (selectedUserIds.length === 0) {
    redirect(usersListUrl("Выберите пользователей для архивирования."));
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  const result = await bulkArchiveUsersUseCase({
    requestedUserIds: selectedUserIds,
    currentUserId: session.user.id,
    audit: {
      actorId: actor.id,
      actorLogin: actor.login,
      actorName: actor.name,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    },
  });

  if (result.status === "NOTHING_TO_ARCHIVE") {
    redirect(
      usersListUrl(
        result.skippedCurrentUser
          ? "Текущего пользователя нельзя архивировать."
          : "Нет пользователей, которых можно архивировать.",
      ),
    );
  }

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  redirect(
    usersListUrl(
      result.skippedCurrentUser
        ? `Архивировано пользователей: ${result.archivedCount}. Текущий пользователь пропущен.`
        : `Архивировано пользователей: ${result.archivedCount}.`,
    ),
  );
}

export async function permanentlyDeleteUser(
  userId: string,
  formData: FormData,
) {
  const session = await requirePermission(PERMISSIONS.USERS_DELETE);
  const confirmed = asString(formData, "confirmPermanentDelete") === "1";
  if (!confirmed) {
    redirect(
      userEditUrl(userId, {
        error: "Подтвердите окончательное удаление пользователя.",
      }),
    );
  }

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await permanentlyDeleteUserUseCase({
      userId,
      currentUserId: session.user.id,
      audit: {
        actorId: actor.id,
        actorLogin: actor.login,
        actorName: actor.name,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof UserApplicationError) {
      if (error.code === "NOT_FOUND") {
        redirect(usersListUrl(error.message));
      }
      redirect(userEditUrl(userId, { error: error.message }));
    }
    console.error("Failed to permanently delete user", error);
    redirect(
      userEditUrl(userId, {
        error:
          "Не удалось окончательно удалить пользователя. Проверьте связанные данные и попробуйте снова.",
      }),
    );
  }

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${result.user.id}/edit`);
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
  const returnTab = asUserEditReturnTab(formData);
  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await updateUserProfileUseCase({
      userId,
      canEditAccessLevel,
      fields: {
        firstName: asString(formData, "firstName"),
        lastName: asOptionalString(formData, "lastName"),
        loginInput: asString(formData, "login").toLowerCase(),
        email: asOptionalString(formData, "email"),
        password: asString(formData, "password"),
        passwordConfirm: asString(formData, "passwordConfirm"),
        groupId: asString(formData, "groupId"),
        departmentId: asString(formData, "departmentId"),
        organizationId: asString(formData, "organizationId"),
        avatarUrl: asOptionalAvatarUrl(formData),
        statusRaw: asString(formData, "status"),
        statusControl: asString(formData, "statusControl"),
        activeUserChecked: hasCheckedValue(formData, "activeUser", "1"),
        submittedRoles: collectRoleNames(formData),
      },
      security: securitySettings,
      actor: {
        id: actor.id,
        login: actor.login,
        name: actor.name,
      },
      audit: {
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
      authorizeRoleChange: async () => {
        // Двойной guard от рассинхрона session.user.permissions с актуальной
        // сессией: use-case вызовет только когда роли реально меняются.
        await requirePermission(PERMISSIONS.USERS_EDIT_ACCESS_LEVEL);
      },
    });
  } catch (error) {
    if (error instanceof UserApplicationError) {
      if (error.code === "NOT_FOUND") {
        redirect(usersListUrl(error.message));
      }
      redirectUserEditError(userId, error.message);
    }
    console.error("Failed to update user", error);
    redirectUserEditError(
      userId,
      "Не удалось сохранить изменения. Попробуйте еще раз.",
    );
  }

  revalidatePath("/admin/users-groups");
  revalidatePath("/admin/departments");
  revalidatePath("/admin/organizations");
  revalidatePath(`/admin/users/${result.userId}/edit`);
  const notice = canEditAccessLevel
    ? result.passwordUpdated
      ? "Пользователь обновлен. Пароль изменен."
      : "Пользователь обновлен."
    : "Профиль ученика обновлен.";

  if (returnTab === "personal") {
    redirect(usersListUrl(notice));
  }

  redirect(
    userEditUrl(result.userId, {
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

  const auditContext = await getAuditRequestContext();
  const actor = auditActorFromSessionUser(session.user);

  let result;
  try {
    result = await assignCourseToLearnerUseCase({
      courseId,
      learnerId: userId,
      accessExpiresAt,
      audit: {
        actorId: actor.id,
        actorLogin: actor.login,
        actorName: actor.name,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    });
  } catch (error) {
    if (error instanceof EnrollmentApplicationError) {
      if (error.code === "USER_NOT_FOUND") {
        redirect(usersListUrl(error.message));
      }
      if (error.code === "ALREADY_ASSIGNED") {
        redirect(coursesTabUrl({ notice: error.message }));
      }
      redirect(coursesTabUrl({ error: error.message }));
    }
    throw error;
  }

  const { course, learner } = result;
  if (learner.email && learner.status === USER_STATUSES.ACTIVE) {
    try {
      await enqueueCourseAssignedEmails(
        [{ email: learner.email, name: learner.name, firstName: learner.firstName }],
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
  const temporaryPassword = generatePasswordForPolicy(securitySettings);

  let result;
  try {
    result = await resetUserPasswordUseCase({
      userId,
      newPassword: temporaryPassword,
    });
  } catch (error) {
    if (error instanceof UserApplicationError) {
      if (error.code === "NOT_FOUND") {
        redirect(usersListUrl(error.message));
      }
      redirect(userEditUrl(userId, { error: error.message }));
    }
    throw error;
  }

  const user = result.user;
  let inviteQueued = true;
  let notice = "Временный пароль сохранен и поставлен в очередь на отправку.";

  try {
    await enqueueUserAccessEmails(
      [
        {
          email: user.email!,
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
    inviteQueued = false;
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
      inviteQueued,
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
  const temporaryPassword = generatePasswordForPolicy(securitySettings);

  let result;
  try {
    result = await sendUserInviteUseCase({
      userId,
      canEditAccessLevel,
      newPassword: temporaryPassword,
    });
  } catch (error) {
    if (error instanceof UserApplicationError) {
      if (error.code === "NOT_FOUND" || error.code === "HR_FORBIDDEN") {
        redirect(usersListUrl(error.message));
      }
      redirect(userEditUrl(userId, { error: error.message }));
    }
    throw error;
  }

  const user = result.user;
  let inviteQueued = true;
  let notice = "Приглашение отправлено: временный пароль поставлен в очередь.";

  try {
    await enqueueUserAccessEmails(
      [
        {
          email: user.email!,
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
    inviteQueued = false;
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
      inviteQueued,
      byHrManager: !canEditAccessLevel,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${user.id}/edit`);
  redirect(userEditUrl(user.id, { notice }));
}
