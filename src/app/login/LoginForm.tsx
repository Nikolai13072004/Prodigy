"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button, Input, Label } from "@/components/ui";

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
        <Label htmlFor="login" className="block">
          Логин
        </Label>
        <Input
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          required
          placeholder="например admin"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="password" className="block">
          Пароль
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1"
        />
      </div>
      <div className="-mt-2 text-right">
        <Link className="text-sm font-medium text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline" href="/forgot-password">
          Забыли пароль?
        </Link>
      </div>
      {requiresTwoFactor && (
        <div>
          <Label htmlFor="twoFactorCode" className="block">
            Код 2FA или recovery-код
          </Label>
          <Input
            id="twoFactorCode"
            name="twoFactorCode"
            type="text"
            autoComplete="one-time-code"
            required
            placeholder="123456 или ABCD-EFGH"
            className="mt-1"
          />
          <p className="mt-2 text-xs text-[var(--ink-muted)]">
            Для администраторов после включения политики безопасности обязателен код из Google Authenticator.
          </p>
        </div>
      )}
      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
