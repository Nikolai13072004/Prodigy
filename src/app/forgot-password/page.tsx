import Link from "next/link";
import Image from "next/image";
import { requestPasswordReset } from "@/app/actions/password-reset-actions";
import { getPlatformSettings } from "@/lib/platform-settings";
import { Button, Field, Input } from "@/components/ui";

type Props = { searchParams: Promise<{ notice?: string; error?: string }> };

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const [settings, sp] = await Promise.all([getPlatformSettings(), searchParams]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex justify-center">
        {settings.logoUrl ? (
          <Image
            src={settings.logoUrl}
            alt={settings.siteName}
            width={180}
            height={58}
            className="h-[3.6rem] w-auto object-contain"
            priority
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="text-center text-3xl font-semibold text-[var(--ink)]">{settings.siteName}</div>
        )}
      </div>

      <p className="text-center text-sm font-medium uppercase tracking-[0.2em] text-[var(--ink-muted)]">{settings.siteName}</p>
      <h1 className="mt-2 text-center text-2xl font-semibold">Восстановление пароля</h1>
      <p className="mt-3 text-center text-sm text-[var(--ink-muted)]">
        Введите логин или email. Если аккаунт найден, мы отправим ссылку для создания нового пароля.
      </p>

      {sp.notice ? (
        <p className="mt-6 rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {sp.notice}
        </p>
      ) : null}

      {sp.error ? (
        <p className="mt-6 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {sp.error}
        </p>
      ) : null}

      <form action={requestPasswordReset} className="mt-8 space-y-4">
        <Field label="Логин или email" htmlFor="identifier">
          <Input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
          />
        </Field>

        <Button type="submit" className="w-full">
          Отправить ссылку
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--ink-muted)]">
        <Link className="text-[var(--ink)] underline-offset-2 hover:underline" href="/login">
          Вернуться ко входу
        </Link>
      </p>

      {settings.supportEmail ? (
        <p className="mt-4 text-center text-sm text-[var(--ink-muted)]">
          Поддержка: {" "}
          <a className="text-[var(--ink)] underline-offset-2 hover:underline" href={`mailto:${settings.supportEmail}`}>
            {settings.supportEmail}
          </a>
        </p>
      ) : null}
    </main>
  );
}
