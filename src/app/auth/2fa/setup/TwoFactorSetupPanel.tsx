"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { completeAdminTotpSetup } from "@/app/actions/two-factor-actions";

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
      <section className="mt-8 rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">2FA подключена</h2>
        <p className="mt-3 text-sm text-zinc-600">
          Сохраните recovery-коды в защищенном месте. Каждый код можно использовать только один раз, если под рукой нет Google Authenticator.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {recoveryCodes.map((code) => (
            <div
              key={code}
              className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm tracking-[0.16em] text-zinc-900"
            >
              {code}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              handleLogout(buildLoginUrl(callbackUrl, "2FA подключена. Теперь войдите с кодом приложения."))
            }
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Я сохранил recovery-коды, войти заново
          </button>
        </div>
      </section>
    );
  }

  if (alreadyConfigured || !secret || !otpAuthUrl) {
    return (
      <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-950">2FA уже подключена</h2>
        <p className="mt-3 text-sm text-zinc-600">
          Для завершения входа выйдите из промежуточной сессии и авторизуйтесь заново с кодом из Google Authenticator.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              handleLogout(buildLoginUrl(callbackUrl, "Введите код из Google Authenticator или recovery-код."))
            }
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Вернуться ко входу
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-950">Подключите Google Authenticator</h2>
      <p className="mt-3 text-sm text-zinc-600">
        Политика безопасности {siteName} требует TOTP для всех администраторов. Добавьте новый аккаунт в Google Authenticator по ключу ниже, затем введите 6-значный код подтверждения.
      </p>

      <ol className="mt-6 space-y-2 text-sm text-zinc-700">
        <li>1. Откройте Google Authenticator и выберите «Добавить код».</li>
        <li>2. Используйте ручной ввод ключа, если QR-код вам не нужен.</li>
        <li>3. После подтверждения сохраните recovery-коды и войдите заново.</li>
      </ol>

      <div className="mt-6 grid gap-5">
        <div>
          <label htmlFor="totpAccount" className="block text-sm font-medium text-zinc-900">
            Аккаунт
          </label>
          <input
            id="totpAccount"
            readOnly
            value={accountName}
            className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-700 outline-none"
          />
        </div>

        <div>
          <label htmlFor="totpSecret" className="block text-sm font-medium text-zinc-900">
            Ключ для ручного ввода
          </label>
          <input
            id="totpSecret"
            readOnly
            value={secret}
            className="mt-2 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 font-mono text-sm tracking-[0.16em] text-zinc-700 outline-none"
          />
        </div>

        <div>
          <label htmlFor="otpAuthUrl" className="block text-sm font-medium text-zinc-900">
            `otpauth://` ссылка
          </label>
          <textarea
            id="otpAuthUrl"
            readOnly
            value={otpAuthUrl}
            rows={3}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-3 text-sm text-zinc-700 outline-none"
          />
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input type="hidden" name="secret" value={secret} />

        <div>
          <label htmlFor="twoFactorCode" className="block text-sm font-medium text-zinc-900">
            Код из Google Authenticator
          </label>
          <input
            id="twoFactorCode"
            name="twoFactorCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending ? "Подключаем 2FA…" : "Подключить Google Authenticator"}
          </button>

          <button
            type="button"
            onClick={() => handleLogout("/login")}
            className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Отменить и выйти
          </button>
        </div>
      </form>
    </section>
  );
}
