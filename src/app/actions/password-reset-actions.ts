"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit-log";
import { enqueuePasswordResetLinkEmails } from "@/lib/email/queue";
import {
  getPlatformSecuritySettings,
  validatePasswordAgainstPolicy,
} from "@/lib/platform-settings";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiresAt,
  passwordResetTtlLabel,
} from "@/lib/password-resets";
import prisma from "@/lib/prisma";
import { USER_STATUSES, isAccessRevokedUserStatus } from "@/lib/users";

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://127.0.0.1:3002"
  );
}

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function forgotPasswordUrl(params?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `/forgot-password?${suffix}` : "/forgot-password";
}

function resetPasswordUrl(token: string, params?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `/reset-password/${token}?${suffix}` : `/reset-password/${token}`;
}

function resetPasswordError(token: string, message: string): never {
  redirect(resetPasswordUrl(token, { error: message }));
}

function loginNoticeUrl(message: string) {
  const params = new URLSearchParams({ notice: message });
  return `/login?${params.toString()}`;
}

function identifierVariants(identifier: string) {
  return Array.from(new Set([identifier, identifier.toLowerCase()]));
}

export async function requestPasswordReset(formData: FormData) {
  const identifier = asString(formData, "identifier");
  if (!identifier) {
    redirect(forgotPasswordUrl({ error: "Введите логин или email." }));
  }

  const variants = identifierVariants(identifier);
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ login: { in: variants } }, { email: { in: variants } }],
    },
    select: {
      id: true,
      email: true,
      login: true,
      name: true,
      firstName: true,
      status: true,
    },
  });

  if (user?.email && user.status === USER_STATUSES.ACTIVE) {
    const email = user.email;
    const resetToken = createPasswordResetToken();
    const resetUrl = `${appBaseUrl()}/reset-password/${resetToken.token}`;

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          email,
          tokenHash: resetToken.tokenHash,
          expiresAt: passwordResetExpiresAt(),
        },
      });
    });

    let emailQueued = true;
    try {
      await enqueuePasswordResetLinkEmails(
        [
          {
            email,
            name: user.name,
            firstName: user.firstName,
            login: user.login,
            resetUrl,
          },
        ],
        { linkTtlLabel: passwordResetTtlLabel() },
      );
    } catch (error) {
      emailQueued = false;
      console.error("Failed to queue password reset link email", error);
    }

    await recordAuditEvent({
      action: "auth:password_reset_requested",
      objectType: "user",
      objectId: user.id,
      objectLabel: user.name,
      metadata: {
        login: user.login,
        email,
        emailQueued,
      },
    });
  } else if (user) {
    await recordAuditEvent({
      action: "auth:password_reset_skipped",
      objectType: "user",
      objectId: user.id,
      objectLabel: user.name,
      metadata: {
        login: user.login,
        hasEmail: Boolean(user.email),
        status: user.status,
      },
    });
  }

  redirect(
    forgotPasswordUrl({
      notice:
        "Если аккаунт найден и у него указан email, мы отправили ссылку для сброса пароля.",
    }),
  );
}

export async function resetPasswordWithToken(formData: FormData) {
  const token = asString(formData, "token");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!token) redirect(loginNoticeUrl("Ссылка сброса пароля недействительна."));
  if (!password) resetPasswordError(token, "Укажите новый пароль.");
  if (password !== passwordConfirm) {
    resetPasswordError(token, "Пароли не совпадают.");
  }

  const securitySettings = await getPlatformSecuritySettings();
  const passwordError = validatePasswordAgainstPolicy(password, securitySettings);
  if (passwordError) resetPasswordError(token, passwordError);

  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          login: true,
          email: true,
          status: true,
        },
      },
    },
  });

  if (!reset) resetPasswordError(token, "Ссылка сброса пароля не найдена или уже недействительна.");
  if (reset.status !== "PENDING") {
    resetPasswordError(token, "Эта ссылка сброса пароля уже использована или отменена.");
  }

  if (reset.expiresAt.getTime() < Date.now()) {
    await prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { status: "EXPIRED" },
    });
    resetPasswordError(token, "Срок действия ссылки сброса пароля истек. Запросите новую ссылку.");
  }

  if (isAccessRevokedUserStatus(reset.user.status)) {
    resetPasswordError(token, "Для восстановления доступа обратитесь к администратору.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const usedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
        status: reset.user.status === USER_STATUSES.PENDING ? USER_STATUSES.ACTIVE : reset.user.status,
      },
    });

    await tx.passwordResetToken.update({
      where: { id: reset.id },
      data: {
        status: "USED",
        usedAt,
      },
    });

    await tx.passwordResetToken.updateMany({
      where: {
        userId: reset.userId,
        status: "PENDING",
        NOT: { id: reset.id },
      },
      data: { status: "CANCELLED" },
    });
  });

  await recordAuditEvent({
    actor: {
      id: reset.user.id,
      login: reset.user.login,
      name: reset.user.name,
    },
    action: "users:reset_password_self_service",
    objectType: "user",
    objectId: reset.user.id,
    objectLabel: reset.user.name,
    metadata: {
      login: reset.user.login,
      email: reset.user.email,
      passwordResetTokenId: reset.id,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${reset.user.id}/edit`);
  redirect(loginNoticeUrl("Пароль обновлен. Теперь войдите с новым паролем."));
}
