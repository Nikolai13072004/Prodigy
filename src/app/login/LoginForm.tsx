"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";

type Props = { callbackUrl?: string };

export function LoginForm({ callbackUrl }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const login = String(fd.get("login") ?? "");
    const password = String(fd.get("password") ?? "");
    const twoFactorCode = String(fd.get("twoFactorCode") ?? "");
    const res = await signIn("credentials", {
      login,
      password,
      twoFactorCode,
      redirect: false,
    });
    setPending(false);
    if (res?.error) {
      if (res.code === "twofactor_required") {
        setRequiresTwoFactor(true);
        setError("Введите код из Google Authenticator или recovery-код.");
        return;
      }

      if (res.code === "twofactor_invalid") {
        setRequiresTwoFactor(true);
        setError("Неверный код подтверждения или recovery-код.");
        return;
      }

      setError(
        res.code === "locked"
          ? "Слишком много неудачных попыток входа. Повторите позже."
          : res.code === "maintenance"
            ? "Платформа на техническом обслуживании. Вход временно доступен только администраторам."
            : "Неверный логин или пароль."
      );
      return;
    }
    const safe =
      callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/";
    window.location.href = safe;
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="login" className="block text-sm font-medium">
          Логин
        </label>
        <input
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          required
          placeholder="например admin"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="-mt-2 text-right">
        <Link className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline" href="/forgot-password">
          Забыли пароль?
        </Link>
      </div>
      {requiresTwoFactor && (
        <div>
          <label htmlFor="twoFactorCode" className="block text-sm font-medium">
            Код 2FA или recovery-код
          </label>
          <input
            id="twoFactorCode"
            name="twoFactorCode"
            type="text"
            autoComplete="one-time-code"
            required
            placeholder="123456 или ABCD-EFGH"
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Для администраторов после включения политики безопасности обязателен код из Google Authenticator.
          </p>
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
