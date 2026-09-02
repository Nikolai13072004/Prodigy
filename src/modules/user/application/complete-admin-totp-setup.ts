// Use-case завершения подключения 2FA (TOTP) администратором: проверка кода,
// генерация recovery-кодов, сохранение зашифрованного секрета и хешей кодов.
// Крипто-функции инжектируются — use-case тестируется без реальной криптографии.
// Guard сессии, нормализация ввода и аудит остаются на транспорте.

export interface UserTotpRepository {
  upsertTotpCredential(input: {
    userId: string;
    secretCiphertext: string;
    recoveryCodesJson: string;
  }): Promise<void>;
}

export type CompleteAdminTotpSetupCommand = {
  userId: string;
  secret: string;
  code: string;
};

export type CompleteAdminTotpSetupResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; reason: "INVALID_CODE" };

export type CompleteAdminTotpSetupDeps = {
  repository: UserTotpRepository;
  verifyTotpCode: (secret: string, code: string) => boolean;
  generateRecoveryCodes: () => string[];
  encryptTotpSecret: (secret: string) => string;
  hashRecoveryCode: (code: string) => string;
};

export function createCompleteAdminTotpSetup(deps: CompleteAdminTotpSetupDeps) {
  const { repository, verifyTotpCode, generateRecoveryCodes, encryptTotpSecret, hashRecoveryCode } =
    deps;

  return async function completeAdminTotpSetup(
    command: CompleteAdminTotpSetupCommand,
  ): Promise<CompleteAdminTotpSetupResult> {
    if (!verifyTotpCode(command.secret, command.code)) {
      return { ok: false, reason: "INVALID_CODE" };
    }

    const recoveryCodes = generateRecoveryCodes();
    await repository.upsertTotpCredential({
      userId: command.userId,
      secretCiphertext: encryptTotpSecret(command.secret),
      recoveryCodesJson: JSON.stringify(recoveryCodes.map((code) => hashRecoveryCode(code))),
    });

    return { ok: true, recoveryCodes };
  };
}
