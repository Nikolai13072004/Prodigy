import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import {
  getPlatformSettings,
  pruneExpiredLoginEvents,
  resolveMaintenanceMessage,
  type PlatformSecuritySettingsState,
} from "@/lib/platform-settings";
import { getPermissionsForRoleNames } from "@/lib/role-profiles";
import {
  PERMISSIONS,
  ROLES,
  hasPermission,
  isPlatformAdminRole,
  primaryRole,
} from "@/lib/roles";
import {
  consumeRecoveryCode,
  decryptTotpSecret,
  verifyTotpCode,
} from "@/lib/two-factor";
import { USER_STATUSES, isAccessRevokedUserStatus } from "@/lib/users";

class LoginLockedError extends CredentialsSignin {
  code = "locked";
}

class TwoFactorRequiredError extends CredentialsSignin {
  code = "twofactor_required";
}

class TwoFactorInvalidError extends CredentialsSignin {
  code = "twofactor_invalid";
}

class MaintenanceModeError extends CredentialsSignin {
  code = "maintenance";
}

type AuthUserRecord = {
  id: string;
  login: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  failedLoginAttempts: number;
  loginLockedUntil: Date | null;
  userRoles: Array<{ roleProfile: { name: string } }>;
  totpCredential: {
    id: string;
    secretCiphertext: string;
    recoveryCodesJson: string;
  } | null;
};

function getUserRoles(user: Pick<AuthUserRecord, "role" | "userRoles">) {
  return [
    ...new Set(
      [
        ...user.userRoles.map((item) => item.roleProfile.name),
        user.role,
      ].filter(Boolean),
    ),
  ];
}

function requiresAdminTotp(
  security: PlatformSecuritySettingsState,
  roles: string[],
) {
  return security.adminTotpRequired && isPlatformAdminRole(roles);
}

function pickSecuritySettings(
  settings: Awaited<ReturnType<typeof getPlatformSettings>>,
): PlatformSecuritySettingsState {
  return {
    passwordMinLength: settings.passwordMinLength,
    passwordRequireNumber: settings.passwordRequireNumber,
    passwordRequireUppercase: settings.passwordRequireUppercase,
    passwordRequireSpecialChar: settings.passwordRequireSpecialChar,
    sessionMaxAgeMinutes: settings.sessionMaxAgeMinutes,
    sessionIdleTimeoutMinutes: settings.sessionIdleTimeoutMinutes,
    maxFailedLoginAttempts: settings.maxFailedLoginAttempts,
    loginLockoutMinutes: settings.loginLockoutMinutes,
    loginEventRetentionDays: settings.loginEventRetentionDays,
    auditLogRetentionDays: settings.auditLogRetentionDays,
    adminTotpRequired: settings.adminTotpRequired,
    userActivationInviteTtlDays: settings.userActivationInviteTtlDays,
    courseInviteTtlDays: settings.courseInviteTtlDays,
  };
}

async function buildSessionUserFromRecord(
  user: AuthUserRecord,
  options?: {
    twoFactorVerified?: boolean;
    twoFactorSetupRequired?: boolean;
  },
) {
  if (isAccessRevokedUserStatus(user.status)) return null;

  const roles = getUserRoles(user);

  return {
    id: user.id,
    email: user.email ?? user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    image: user.avatarUrl,
    role: primaryRole(roles) ?? ROLES.STUDENT,
    roles,
    permissions: await getPermissionsForRoleNames(roles),
    twoFactorVerified: options?.twoFactorVerified ?? true,
    twoFactorSetupRequired: options?.twoFactorSetupRequired ?? false,
  };
}

async function loadCurrentSessionUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          roleProfile: {
            select: { name: true },
          },
        },
      },
      totpCredential: {
        select: { id: true },
      },
    },
  });

  if (!user) return null;

  const sessionUser = await buildSessionUserFromRecord({
    ...user,
    totpCredential: user.totpCredential
      ? {
          id: user.totpCredential.id,
          secretCiphertext: "",
          recoveryCodesJson: "[]",
        }
      : null,
  });

  if (!sessionUser) return null;

  return {
    ...sessionUser,
    hasTotpCredential: Boolean(user.totpCredential),
  };
}

async function registerFailedLoginAttempt(
  user: Pick<AuthUserRecord, "id" | "login" | "name" | "failedLoginAttempts">,
  security: PlatformSecuritySettingsState,
  reason: "password_mismatch" | "two_factor_invalid",
) {
  const nextFailedLoginAttempts = user.failedLoginAttempts + 1;

  if (nextFailedLoginAttempts >= security.maxFailedLoginAttempts) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        loginLockedUntil: new Date(
          Date.now() + security.loginLockoutMinutes * 60 * 1000,
        ),
      },
    });
    await recordAuditEvent({
      actor: {
        id: user.id,
        login: user.login,
        name: user.name,
      },
      action: "auth:login_locked",
      objectType: "user",
      objectId: user.id,
      objectLabel: user.name,
      metadata: {
        login: user.login,
        reason,
        maxFailedLoginAttempts: security.maxFailedLoginAttempts,
        loginLockoutMinutes: security.loginLockoutMinutes,
      },
    });
    throw new LoginLockedError();
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: nextFailedLoginAttempts,
    },
  });

  await recordAuditEvent({
    actor: {
      id: user.id,
      login: user.login,
      name: user.name,
    },
    action: "auth:login_failed",
    objectType: "user",
    objectId: user.id,
    objectLabel: user.name,
    metadata: {
      login: user.login,
      reason,
      failedLoginAttempts: nextFailedLoginAttempts,
      maxFailedLoginAttempts: security.maxFailedLoginAttempts,
    },
  });
}

function callbackUrlForRequest(request: {
  nextUrl: { pathname: string; search: string };
}) {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const platformSettings = await getPlatformSettings();
  const security = pickSecuritySettings(platformSettings);
  const maintenanceMessage = resolveMaintenanceMessage(
    platformSettings.maintenanceMessage,
  );

  return {
    trustHost: true,
    session: { strategy: "jwt", maxAge: security.sessionMaxAgeMinutes * 60 },
    pages: { signIn: "/login" },
    providers: [
      Credentials({
        id: "credentials",
        name: "Логин и пароль",
        credentials: {
          login: { label: "Логин", type: "text" },
          password: { label: "Пароль", type: "password" },
          twoFactorCode: { label: "Код 2FA", type: "text" },
        },
        async authorize(credentials) {
          const loginRaw = credentials?.login;
          const passwordRaw = credentials?.password;
          if (!loginRaw || !passwordRaw) return null;

          const login = String(loginRaw).trim().toLowerCase();
          const twoFactorCode = String(credentials?.twoFactorCode ?? "").trim();
          const user = await prisma.user.findUnique({
            where: { login },
            include: {
              userRoles: {
                include: {
                  roleProfile: {
                    select: { name: true },
                  },
                },
              },
              totpCredential: {
                select: {
                  id: true,
                  secretCiphertext: true,
                  recoveryCodesJson: true,
                },
              },
            },
          });
          if (!user) {
            await recordAuditEvent({
              action: "auth:login_failed",
              objectType: "auth",
              objectLabel: login,
              metadata: {
                login,
                reason: "unknown_login",
              },
            });
            return null;
          }

          if (
            user.loginLockedUntil &&
            user.loginLockedUntil.getTime() > Date.now()
          ) {
            await recordAuditEvent({
              actor: {
                id: user.id,
                login: user.login,
                name: user.name,
              },
              action: "auth:login_locked",
              objectType: "user",
              objectId: user.id,
              objectLabel: user.name,
              metadata: {
                login: user.login,
                reason: "already_locked",
                loginLockedUntil: user.loginLockedUntil,
              },
            });
            throw new LoginLockedError();
          }

          const passwordMatches = await bcrypt.compare(
            String(passwordRaw),
            user.passwordHash,
          );
          if (!passwordMatches) {
            await registerFailedLoginAttempt(
              user,
              security,
              "password_mismatch",
            );
            return null;
          }

          if (isAccessRevokedUserStatus(user.status)) {
            await recordAuditEvent({
              actor: {
                id: user.id,
                login: user.login,
                name: user.name,
              },
              action: "auth:login_failed",
              objectType: "user",
              objectId: user.id,
              objectLabel: user.name,
              metadata: {
                login: user.login,
                reason:
                  user.status === USER_STATUSES.ARCHIVED
                    ? "archived_user"
                    : "blocked_user",
              },
            });
            return null;
          }

          const roles = getUserRoles(user);
          if (platformSettings.maintenanceMode && !isPlatformAdminRole(roles)) {
            await recordAuditEvent({
              actor: {
                id: user.id,
                login: user.login,
                name: user.name,
              },
              action: "auth:login_failed",
              objectType: "user",
              objectId: user.id,
              objectLabel: user.name,
              metadata: {
                login: user.login,
                reason: "maintenance_mode",
              },
            });
            throw new MaintenanceModeError();
          }

          const adminTotpRequired = requiresAdminTotp(security, roles);

          if (adminTotpRequired && !user.totpCredential) {
            try {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  failedLoginAttempts: 0,
                  loginLockedUntil: null,
                },
              });
            } catch (error) {
              console.error(
                "Failed to reset login security state before 2FA setup",
                error,
              );
            }

            await recordAuditEvent({
              actor: {
                id: user.id,
                login: user.login,
                name: user.name,
              },
              action: "auth:two_factor_setup_required",
              objectType: "user",
              objectId: user.id,
              objectLabel: user.name,
              metadata: {
                login: user.login,
              },
            });

            return buildSessionUserFromRecord(user, {
              twoFactorVerified: false,
              twoFactorSetupRequired: true,
            });
          }

          let nextRecoveryCodesJson: string | null = null;
          const activatesPendingUser = user.status === USER_STATUSES.PENDING;

          if (adminTotpRequired && user.totpCredential) {
            if (!twoFactorCode) {
              await recordAuditEvent({
                actor: {
                  id: user.id,
                  login: user.login,
                  name: user.name,
                },
                action: "auth:login_failed",
                objectType: "user",
                objectId: user.id,
                objectLabel: user.name,
                metadata: {
                  login: user.login,
                  reason: "two_factor_required",
                },
              });
              throw new TwoFactorRequiredError();
            }

            const totpSecret = decryptTotpSecret(
              user.totpCredential.secretCiphertext,
            );
            const totpMatches = verifyTotpCode(totpSecret, twoFactorCode);

            if (!totpMatches) {
              const recoveryResult = consumeRecoveryCode(
                user.totpCredential.recoveryCodesJson,
                twoFactorCode,
              );
              if (!recoveryResult.matched) {
                await registerFailedLoginAttempt(
                  user,
                  security,
                  "two_factor_invalid",
                );
                throw new TwoFactorInvalidError();
              }

              nextRecoveryCodesJson = recoveryResult.nextRecoveryCodesJson;
            }
          }

          try {
            await prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: user.id },
                data: {
                  failedLoginAttempts: 0,
                  loginLockedUntil: null,
                  ...(activatesPendingUser
                    ? { status: USER_STATUSES.ACTIVE }
                    : {}),
                },
              });

              if (nextRecoveryCodesJson && user.totpCredential) {
                await tx.userTotpCredential.update({
                  where: { userId: user.id },
                  data: {
                    recoveryCodesJson: nextRecoveryCodesJson,
                  },
                });
              }

              await tx.loginEvent.create({ data: { userId: user.id } });
            });

            await pruneExpiredLoginEvents(security.loginEventRetentionDays);
          } catch (error) {
            console.error("Failed to update login security state", error);
          }

          const sessionUserRecord = activatesPendingUser
            ? { ...user, status: USER_STATUSES.ACTIVE }
            : user;

          await recordAuditEvent({
            actor: {
              id: user.id,
              login: user.login,
              name: user.name,
            },
            action: "auth:login_success",
            objectType: "user",
            objectId: user.id,
            objectLabel: user.name,
            metadata: {
              login: user.login,
              roles,
              twoFactorRequired: adminTotpRequired,
              recoveryCodeUsed: Boolean(nextRecoveryCodesJson),
              activatedPendingUser: activatesPendingUser,
            },
          });

          return buildSessionUserFromRecord(sessionUserRecord, {
            twoFactorVerified: true,
            twoFactorSetupRequired: false,
          });
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        const now = Date.now();
        if (user) {
          token.id = user.id;
          token.sub = user.id;
          token.email = user.email;
          token.role = user.role;
          token.roles =
            (user.roles as string[] | undefined) ??
            (user.role ? [String(user.role)] : []);
          token.name = user.name;
          token.avatarUrl = user.avatarUrl ?? null;
          token.permissions = (user.permissions as string[] | undefined) ?? [];
          token.twoFactorVerified = user.twoFactorVerified === true;
          token.twoFactorSetupRequired = user.twoFactorSetupRequired === true;
          token.lastActivityAt = now;
          return token;
        }

        const currentUserId =
          typeof token.id === "string"
            ? token.id
            : typeof token.sub === "string"
              ? token.sub
              : null;
        if (!currentUserId) return token;

        const idleTimeoutMs = security.sessionIdleTimeoutMinutes * 60 * 1000;
        const lastActivityAt = typeof token.lastActivityAt === "number" ? token.lastActivityAt : now;
        if (idleTimeoutMs > 0 && now - lastActivityAt > idleTimeoutMs) {
          return null;
        }

        const currentUser = await loadCurrentSessionUser(currentUserId);
        if (!currentUser) {
          return null;
        }

        token.id = currentUser.id;
        token.sub = currentUser.id;
        token.email = currentUser.email;
        token.role = currentUser.role;
        token.roles = currentUser.roles;
        token.name = currentUser.name;
        token.avatarUrl = currentUser.avatarUrl ?? null;
        token.permissions = currentUser.permissions;
        token.lastActivityAt = now;

        if (!requiresAdminTotp(security, currentUser.roles)) {
          token.twoFactorVerified = true;
          token.twoFactorSetupRequired = false;
        } else if (token.twoFactorVerified === true) {
          token.twoFactorSetupRequired = false;
        } else if (!currentUser.hasTotpCredential) {
          token.twoFactorVerified = false;
          token.twoFactorSetupRequired = true;
        } else {
          token.twoFactorVerified = token.twoFactorVerified === true;
          token.twoFactorSetupRequired =
            token.twoFactorVerified === true
              ? false
              : token.twoFactorSetupRequired === true;
        }

        return token;
      },
      session({ session, token }) {
        if (session.user) {
          session.user.id = token.id as string;
          session.user.role = (token.role as string) ?? ROLES.STUDENT;
          session.user.roles = Array.isArray(token.roles)
            ? token.roles.map((value) => String(value))
            : session.user.role
              ? [session.user.role]
              : [];
          session.user.permissions = Array.isArray(token.permissions)
            ? token.permissions.map((value) => String(value))
            : [];
          session.user.twoFactorVerified = token.twoFactorVerified === true;
          session.user.twoFactorSetupRequired =
            token.twoFactorSetupRequired === true;
          if (token.name) {
            session.user.name = token.name as string;
          }
          session.user.avatarUrl =
            typeof token.avatarUrl === "string" ? token.avatarUrl : null;
          session.user.image = session.user.avatarUrl;
        }
        return session;
      },
      authorized({ request, auth: session }) {
        const { pathname } = request.nextUrl;
        const isLoginPage = pathname === "/login";
        const isActivationPage = pathname.startsWith("/activate/");
        const isForgotPasswordPage = pathname === "/forgot-password";
        const isPasswordResetPage = pathname.startsWith("/reset-password/");
        const isInvitePage = pathname.startsWith("/invite/");
        const isMaintenancePage = pathname === "/maintenance";
        const isTwoFactorSetupPage = pathname === "/auth/2fa/setup";
        const sessionRoles = session?.user?.roles ?? [];
        const sessionPermissions = session?.user?.permissions ?? [];
        const isAdminSession = session?.user
          ? isPlatformAdminRole(sessionRoles)
          : false;

        if (isMaintenancePage) {
          if (!platformSettings.maintenanceMode) {
            return NextResponse.redirect(
              new URL(session?.user ? "/" : "/login", request.nextUrl),
            );
          }

          return true;
        }

        if (platformSettings.maintenanceMode) {
          if (isLoginPage) {
            return true;
          }

          if (!isAdminSession) {
            if (
              pathname.startsWith("/api/") &&
              !pathname.startsWith("/api/auth")
            ) {
              return NextResponse.json(
                { error: maintenanceMessage },
                { status: 503 },
              );
            }

            return NextResponse.redirect(
              new URL("/maintenance", request.nextUrl),
            );
          }
        }

        if (
          isLoginPage ||
          isActivationPage ||
          isInvitePage ||
          isForgotPasswordPage ||
          isPasswordResetPage
        ) {
          return true;
        }

        if (!session?.user) {
          if (
            pathname.startsWith("/api/") &&
            !pathname.startsWith("/api/auth")
          ) {
            return NextResponse.json(
              { error: "Требуется вход" },
              { status: 401 },
            );
          }
          const login = new URL("/login", request.nextUrl);
          login.searchParams.set("callbackUrl", callbackUrlForRequest(request));
          return NextResponse.redirect(login);
        }

        const adminTotpRequired = requiresAdminTotp(security, sessionRoles);

        if (isTwoFactorSetupPage) {
          if (adminTotpRequired && session.user.twoFactorSetupRequired) {
            return true;
          }

          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        if (adminTotpRequired && session.user.twoFactorVerified !== true) {
          if (session.user.twoFactorSetupRequired) {
            const setupUrl = new URL("/auth/2fa/setup", request.nextUrl);
            setupUrl.searchParams.set(
              "callbackUrl",
              callbackUrlForRequest(request),
            );
            return NextResponse.redirect(setupUrl);
          }

          const login = new URL("/login", request.nextUrl);
          login.searchParams.set("callbackUrl", callbackUrlForRequest(request));
          login.searchParams.set(
            "notice",
            "Введите код из Google Authenticator или recovery-код.",
          );
          return NextResponse.redirect(login);
        }

        if (
          !hasPermission(
            sessionRoles,
            PERMISSIONS.COURSES_CREATE_EDIT,
            sessionPermissions,
          ) &&
          pathname.startsWith("/api/upload")
        ) {
          return NextResponse.json(
            { error: "Недостаточно прав" },
            { status: 403 },
          );
        }

        const requiresUsersManagement = pathname === "/admin/users-groups";
        if (
          requiresUsersManagement &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.USERS_VIEW,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresUserCreate = pathname === "/admin/users/new";
        if (
          requiresUserCreate &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.USERS_CREATE,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresUserEdit = /^\/admin\/users\/[^/]+\/edit$/.test(pathname);
        if (
          requiresUserEdit &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.USERS_EDIT_PROFILE,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresDepartmentsManagement = pathname === "/admin/departments";
        if (
          requiresDepartmentsManagement &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.DEPARTMENTS_VIEW,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresOrganizationsManagement =
          pathname === "/admin/organizations";
        if (
          requiresOrganizationsManagement &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.ORGANIZATIONS_VIEW,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresRoleManagement =
          pathname === "/admin/roles" ||
          pathname === "/admin/roles/new" ||
          /^\/admin\/roles\/[^/]+$/.test(pathname);
        if (
          requiresRoleManagement &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.USERS_EDIT_ACCESS_LEVEL,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresReporting = pathname === "/analytics";
        if (
          requiresReporting &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.REPORTS_VIEW,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresPlatformSettings = pathname === "/admin/settings";
        if (requiresPlatformSettings && !isPlatformAdminRole(sessionRoles)) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresApiTokens =
          pathname === "/admin/api" || pathname.startsWith("/admin/api/");
        if (requiresApiTokens && !isPlatformAdminRole(sessionRoles)) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresAuditLog =
          pathname === "/admin/audit-log" ||
          pathname.startsWith("/admin/audit-log/");
        if (requiresAuditLog && !isPlatformAdminRole(sessionRoles)) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresCourseManagement =
          pathname === "/courses/new" ||
          /^\/courses\/[^/]+\/quiz\/[^/]+\/builder(?:\/preview)?$/.test(
            pathname,
          );
        if (
          requiresCourseManagement &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.COURSES_CREATE_EDIT,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        const requiresCourseWorkspace = /^\/courses\/[^/]+\/manage$/.test(
          pathname,
        );
        if (
          requiresCourseWorkspace &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.COURSES_CREATE_EDIT,
            sessionPermissions,
          ) &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.COURSES_PUBLISH,
            sessionPermissions,
          ) &&
          !hasPermission(
            sessionRoles,
            PERMISSIONS.COURSES_MANAGE_ASSIGNMENTS,
            sessionPermissions,
          )
        ) {
          return NextResponse.redirect(new URL("/", request.nextUrl));
        }

        return true;
      },
    },
  };
});
