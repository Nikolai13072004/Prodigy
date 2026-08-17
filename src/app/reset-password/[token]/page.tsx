import Link from "next/link";
import { resetPasswordWithToken } from "@/app/actions/password-reset-actions";
import {
  buildPasswordPolicyHint,
  getPlatformSecuritySettings,
} from "@/lib/platform-settings";
import { hashPasswordResetToken } from "@/lib/password-resets";
import prisma from "@/lib/prisma";
import { isAccessRevokedUserStatus } from "@/lib/users";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function PasswordResetPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const [securitySettings, reset] = await Promise.all([
    getPlatformSecuritySettings(),
    prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashPasswordResetToken(token) },
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
    }),
  ]);

  const now = new Date();
  const isExpired = Boolean(reset && reset.expiresAt < now);
  const isRevokedUser = Boolean(reset && isAccessRevokedUserStatus(reset.user.status));
  const isAvailable = Boolean(reset && reset.status === "PENDING" && !isExpired && !isRevokedUser);
  const passwordHint = buildPasswordPolicyHint(securitySettings);

  return (
    <main className="flex min-h-screen items-center bg-[#dfeaf7] px-4 py-10">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[#c7d8ec] bg-white shadow-[0_24px_60px_rgba(12,42,82,0.16)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-[#0c2a52] px-8 py-10 text-white sm:px-10">
          <p className="text-sm uppercase tracking-[0.24em] text-white/70">Сброс пароля</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight">
            {reset ? "Задайте новый пароль" : "Ссылка сброса пароля"}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
            {reset
              ? "Создайте новый пароль для входа в систему обучения."
              : "Мы не смогли найти активную ссылку. Возможно, она устарела или уже была использована."}
          </p>

          <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <p className="text-xs uppercase tracking-[0.22em] text-white/60">Данные аккаунта</p>
            <p className="mt-2 text-lg font-medium">{reset?.user.name ?? "Аккаунт не найден"}</p>
            <p className="mt-3 text-sm text-white/75">Логин: {reset?.user.login ?? "Не удалось определить"}</p>
            <p className="mt-1 text-sm text-white/75">Email: {reset?.email ?? "Не удалось определить"}</p>
          </div>
        </section>

        <section className="px-8 py-10 sm:px-10">
          {isAvailable ? (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-zinc-950">Новый пароль</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  После сохранения старая блокировка входа из-за неудачных попыток будет снята.
                </p>
              </div>

              {sp.error ? (
                <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {sp.error}
                </p>
              ) : null}

              <form action={resetPasswordWithToken} className="mt-8 space-y-4">
                <input type="hidden" name="token" value={token} />

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
                    Новый пароль
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={securitySettings.passwordMinLength}
                    autoComplete="new-password"
                    className="mt-1.5 w-full rounded-2xl border border-[#bfd2e8] px-4 py-3 text-sm outline-none ring-[#008db3] focus:ring-2"
                  />
                  <p className="mt-1.5 text-xs text-zinc-500">{passwordHint}</p>
                </div>

                <div>
                  <label htmlFor="passwordConfirm" className="block text-sm font-medium text-zinc-700">
                    Повторите пароль
                  </label>
                  <input
                    id="passwordConfirm"
                    name="passwordConfirm"
                    type="password"
                    required
                    minLength={securitySettings.passwordMinLength}
                    autoComplete="new-password"
                    className="mt-1.5 w-full rounded-2xl border border-[#bfd2e8] px-4 py-3 text-sm outline-none ring-[#008db3] focus:ring-2"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-[#008db3] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#007fa8]"
                >
                  Сохранить пароль
                </button>
              </form>
            </>
          ) : (
            <div>
              <h2 className="text-2xl font-semibold text-zinc-950">Ссылка недоступна</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {!reset
                  ? "Мы не нашли эту ссылку. Возможно, она была заменена новой или удалена."
                  : reset.status === "USED"
                    ? "Эта ссылка уже использована. Если пароль уже задан, просто войдите в систему."
                    : isExpired
                      ? "Срок действия ссылки истек. Запросите новую ссылку на странице восстановления пароля."
                      : isRevokedUser
                        ? "Для восстановления доступа обратитесь к администратору."
                        : "Ссылка больше не активна. Запросите новую ссылку на странице восстановления пароля."}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/forgot-password"
                  className="inline-flex rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Запросить новую ссылку
                </Link>
                <Link
                  href="/login"
                  className="inline-flex rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Перейти ко входу
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
