import Link from "next/link";
import Image from "next/image";
import { requestPasswordReset } from "@/app/actions/password-reset-actions";
import { getPlatformSettings } from "@/lib/platform-settings";

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
          <div className="text-center text-3xl font-semibold text-zinc-950">{settings.siteName}</div>
        )}
      </div>

      <p className="text-center text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">{settings.siteName}</p>
      <h1 className="mt-2 text-center text-2xl font-semibold">Восстановление пароля</h1>
      <p className="mt-3 text-center text-sm text-zinc-600">
        Введите логин или email. Если аккаунт найден, мы отправим ссылку для создания нового пароля.
      </p>

      {sp.notice ? (
        <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {sp.notice}
        </p>
      ) : null}

      {sp.error ? (
        <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {sp.error}
        </p>
      ) : null}

      <form action={requestPasswordReset} className="mt-8 space-y-4">
        <div>
          <label htmlFor="identifier" className="block text-sm font-medium">
            Логин или email
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Отправить ссылку
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link className="text-zinc-700 underline-offset-2 hover:underline" href="/login">
          Вернуться ко входу
        </Link>
      </p>

      {settings.supportEmail ? (
        <p className="mt-4 text-center text-sm text-zinc-500">
          Поддержка: {" "}
          <a className="text-zinc-700 underline-offset-2 hover:underline" href={`mailto:${settings.supportEmail}`}>
            {settings.supportEmail}
          </a>
        </p>
      ) : null}
    </main>
  );
}
