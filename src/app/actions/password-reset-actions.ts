"use server";

import { appBaseUrl } from "@/lib/app-base-url";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit-log";
import { enqueuePasswordResetLinkEmails } from "@/lib/email/queue";
import { getPlatformSecuritySettings, validatePasswordAgainstPolicy } from "@/lib/platform-settings";
import {
  createPasswordResetToken,
  passwordResetExpiresAt,
  passwordResetTtlLabel,
} from "@/lib/password-resets";
import { SelfServicePasswordResetError } from "@/modules/user/application/self-service-password-reset-errors";
import {
  requestPasswordReset as issuePasswordResetToken,
  resetPasswordWithToken as applyPasswordResetWithToken,
} from "@/modules/user/server/self-service-password-reset";

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

  const resetToken = createPasswordResetToken();
  const { user, issued } = await issuePasswordResetToken({
    identifierVariants: identifierVariants(identifier),
    tokenHash: resetToken.tokenHash,
    expiresAt: passwordResetExpiresAt(),
  });

  if (issued && user?.email) {
    const resetUrl = `${appBaseUrl()}/reset-password/${resetToken.token}`;

    let emailQueued = true;
    try {
      await enqueuePasswordResetLinkEmails(
        [
          {
            email: user.email,
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
        email: user.email,
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

  let result;
  try {
    result = await applyPasswordResetWithToken({ token, password });
  } catch (error) {
    if (error instanceof SelfServicePasswordResetError) {
      resetPasswordError(token, error.message);
    }
    throw error;
  }

  const { user, tokenId } = result;
  await recordAuditEvent({
    actor: {
      id: user.id,
      login: user.login,
      name: user.name,
    },
    action: "users:reset_password_self_service",
    objectType: "user",
    objectId: user.id,
    objectLabel: user.name,
    metadata: {
      login: user.login,
      email: user.email,
      passwordResetTokenId: tokenId,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${user.id}/edit`);
  redirect(loginNoticeUrl("Пароль обновлен. Теперь войдите с новым паролем."));
}
