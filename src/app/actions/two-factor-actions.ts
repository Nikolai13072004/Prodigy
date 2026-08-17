"use server";

import { auth } from "@/auth";
import { auditActorFromSessionUser, recordAuditEvent } from "@/lib/audit-log";
import prisma from "@/lib/prisma";
import { isPlatformAdminRole } from "@/lib/roles";
import {
  encryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyTotpCode,
} from "@/lib/two-factor";

type CompleteAdminTotpSetupResult = {
  error?: string;
  recoveryCodes?: string[];
};

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function completeAdminTotpSetup(formData: FormData): Promise<CompleteAdminTotpSetupResult> {
  const session = await auth();

  if (!session?.user || !isPlatformAdminRole(session.user.roles)) {
    return { error: "Нужен активный сеанс администратора." };
  }

  const secret = asString(formData, "secret").replace(/\s+/g, "").toUpperCase();
  const twoFactorCode = asString(formData, "twoFactorCode");

  if (!secret) {
    return { error: "Секрет TOTP не найден. Обновите страницу и попробуйте снова." };
  }

  if (!twoFactorCode) {
    return { error: "Введите код из Google Authenticator." };
  }

  try {
    if (!verifyTotpCode(secret, twoFactorCode)) {
      return { error: "Код подтверждения не подошел. Проверьте время на устройстве и попробуйте снова." };
    }

    const recoveryCodes = generateRecoveryCodes();

    await prisma.userTotpCredential.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        secretCiphertext: encryptTotpSecret(secret),
        recoveryCodesJson: JSON.stringify(recoveryCodes.map((code) => hashRecoveryCode(code))),
      },
      update: {
        secretCiphertext: encryptTotpSecret(secret),
        recoveryCodesJson: JSON.stringify(recoveryCodes.map((code) => hashRecoveryCode(code))),
      },
    });

    await recordAuditEvent({
      actor: auditActorFromSessionUser(session.user),
      action: "auth:two_factor_setup_completed",
      objectType: "user",
      objectId: session.user.id,
      objectLabel: session.user.name ?? session.user.email ?? session.user.id,
      metadata: {
        recoveryCodesCount: recoveryCodes.length,
      },
    });

    return { recoveryCodes };
  } catch (error) {
    console.error("Failed to complete admin TOTP setup", error);
    return { error: "Не удалось подключить 2FA. Попробуйте еще раз." };
  }
}
