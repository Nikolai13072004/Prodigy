"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { completeAdminTotpSetup } from "@/app/actions/two-factor-actions";
import { Button, Input, Label, Textarea } from "@/components/ui";

type Props = {
  callbackUrl: string;
  siteName: string;
  accountName: string;
  secret: string | null;
  otpAuthUrl: string | null;
  alreadyConfigured: boolean;
};

function buildLoginUrl(callbackUrl: string, notice: string) {
  const search = new URLSearchParams({ notice });

  if (callbackUrl && callbackUrl !== "/") {
    search.set("callbackUrl", callbackUrl);
  }

  return `/login?${search.toString()}`;
}

export function TwoFactorSetupPanel({
  callbackUrl,
  siteName,
  accountName,
  secret,
  otpAuthUrl,
  alreadyConfigured,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleLogout(targetUrl: string) {
    await signOut({ redirect: false });
    window.location.href = targetUrl;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await completeAdminTotpSetup(formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      setRecoveryCodes(result.recoveryCodes ?? []);
    });
  }

  if (recoveryCodes) {
    return (
      <section className="mt-8 rounded-3xl border border-[var(--success)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--ink)]">2FA подключена</h2>
        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          Сохраните recovery-коды в защищенном месте. Каждый код можно использовать только один раз, если под рукой нет Google Authenticator.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {recoveryCodes.map((code) => (
            <div
              key={code}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 font-mono text-sm tracking-[0.16em] text-[var(--ink)]"
            >
              {code}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() =>
              handleLogout(buildLoginUrl(callbackUrl, "2FA подключена. Теперь войдите с кодом приложения."))
            }
          >
            Я сохранил recovery-коды, войти заново
          </Button>
        </div>
      </section>
    );
  }

  if (alreadyConfigured || !secret || !otpAuthUrl) {
    return (
      <section className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--ink)]">2FA уже подключена</h2>
        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          Для завершения входа выйдите из промежуточной сессии и авторизуйтесь заново с кодом из Google Authenticator.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() =>
              handleLogout(buildLoginUrl(callbackUrl, "Введите код из Google Authenticator или recovery-код."))
            }
          >
            Вернуться ко входу
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-[var(--ink)]">Подключите Google Authenticator</h2>
      <p className="mt-3 text-sm text-[var(--ink-muted)]">
        Политика безопасности {siteName} требует TOTP для всех администраторов. Добавьте новый аккаунт в Google Authenticator по ключу ниже, затем введите 6-значный код подтверждения.
      </p>

      <ol className="mt-6 space-y-2 text-sm text-[var(--ink-muted)]">
        <li>1. Откройте Google Authenticator и выберите «Добавить код».</li>
        <li>2. Используйте ручной ввод ключа, если QR-код вам не нужен.</li>
        <li>3. После подтверждения сохраните recovery-коды и войдите заново.</li>
      </ol>

      <div className="mt-6 grid gap-5">
        <div>
          <Label htmlFor="totpAccount" className="block">
            Аккаунт
          </Label>
          <Input id="totpAccount" readOnly value={accountName} className="mt-2" />
        </div>

        <div>
          <Label htmlFor="totpSecret" className="block">
            Ключ для ручного ввода
          </Label>
          <Input
            id="totpSecret"
            readOnly
            value={secret}
            className="mt-2 font-mono tracking-[0.16em]"
          />
        </div>

        <div>
          <Label htmlFor="otpAuthUrl" className="block">
            `otpauth://` ссылка
          </Label>
          <Textarea id="otpAuthUrl" readOnly value={otpAuthUrl} rows={3} className="mt-2" />
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input type="hidden" name="secret" value={secret} />

        <div>
          <Label htmlFor="twoFactorCode" className="block">
            Код из Google Authenticator
          </Label>
          <Input
            id="twoFactorCode"
            name="twoFactorCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="mt-2"
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Подключаем 2FA…" : "Подключить Google Authenticator"}
          </Button>

          <Button type="button" variant="secondary" onClick={() => handleLogout("/login")}>
            Отменить и выйти
          </Button>
        </div>
      </form>
    </section>
  );
}
