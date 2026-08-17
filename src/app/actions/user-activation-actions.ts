"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getPlatformSecuritySettings,
  validatePasswordAgainstPolicy,
} from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { hashUserActivationToken } from "@/lib/user-activations";
import { USER_STATUSES } from "@/lib/users";

function activationPageUrl(token: string, params?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `/activate/${token}?${suffix}` : `/activate/${token}`;
}

function activationError(token: string, message: string): never {
  redirect(activationPageUrl(token, { error: message }));
}

function loginNoticeUrl(message: string) {
  const params = new URLSearchParams({ notice: message });
  return `/login?${params.toString()}`;
}

export async function activateUserAccount(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!token) redirect(loginNoticeUrl("Ссылка активации недействительна."));
  if (!password) activationError(token, "Укажите пароль.");

  const securitySettings = await getPlatformSecuritySettings();
  const passwordError = validatePasswordAgainstPolicy(password, securitySettings);
  if (passwordError) activationError(token, passwordError);

  const invite = await prisma.userActivationInvite.findUnique({
    where: { tokenHash: hashUserActivationToken(token) },
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

  if (!invite) activationError(token, "Ссылка активации не найдена или уже недействительна.");
  if (invite.status !== "PENDING") {
    activationError(token, invite.status === "ACCEPTED" ? "Эта ссылка активации уже использована." : "Ссылка активации больше не активна.");
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.userActivationInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    activationError(token, "Срок действия ссылки активации истек. Попросите администратора отправить новое приглашение.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: invite.userId },
      data: {
        passwordHash,
        status: USER_STATUSES.ACTIVE,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      },
    });

    await tx.userActivationInvite.update({
      where: { id: invite.id },
      data: {
        status: "ACCEPTED",
        activatedAt: new Date(),
      },
    });
  });

  await recordAuditEvent({
    actor: {
      id: invite.user.id,
      login: invite.user.login,
      name: invite.user.name,
    },
    action: "users:activate",
    objectType: "user",
    objectId: invite.user.id,
    objectLabel: invite.user.name,
    metadata: {
      login: invite.user.login,
      email: invite.user.email,
      activationInviteId: invite.id,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${invite.user.id}/edit`);
  redirect(loginNoticeUrl("Активация завершена. Теперь войдите с новым паролем."));
}
