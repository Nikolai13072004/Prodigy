"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getPlatformSecuritySettings,
  validatePasswordAgainstPolicy,
} from "@/lib/platform-settings";
import { ActivateUserAccountError } from "@/modules/user/application/activate-user-account-errors";
import { activateUserAccount as applyUserActivation } from "@/modules/user/server/activate-user-account";

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

  let result;
  try {
    result = await applyUserActivation({ token, password });
  } catch (error) {
    if (error instanceof ActivateUserAccountError) {
      activationError(token, error.message);
    }
    throw error;
  }

  const { user, inviteId } = result;
  await recordAuditEvent({
    actor: {
      id: user.id,
      login: user.login,
      name: user.name,
    },
    action: "users:activate",
    objectType: "user",
    objectId: user.id,
    objectLabel: user.name,
    metadata: {
      login: user.login,
      email: user.email,
      activationInviteId: inviteId,
    },
  });

  revalidatePath("/admin/users-groups");
  revalidatePath(`/admin/users/${user.id}/edit`);
  redirect(loginNoticeUrl("Активация завершена. Теперь войдите с новым паролем."));
}
