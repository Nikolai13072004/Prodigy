import Link from "next/link";
import { activateUserAccount } from "@/app/actions/user-activation-actions";
import { buildPasswordPolicyHint, getPlatformSecuritySettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { hashUserActivationToken } from "@/lib/user-activations";
import { Button, Field, Input, buttonStyles } from "@/components/ui";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function UserActivationPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const [securitySettings, invite] = await Promise.all([
    getPlatformSecuritySettings(),
    prisma.userActivationInvite.findUnique({
      where: { tokenHash: hashUserActivationToken(token) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            login: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const isExpired = invite?.status === "EXPIRED";
  const isAvailable = Boolean(invite && invite.status === "PENDING");
  const passwordHint = buildPasswordPolicyHint(securitySettings);

  return (
    <main className="flex min-h-screen items-center bg-[var(--canvas)] px-4 py-10">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-2)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-[var(--aurora-sidebar)] px-8 py-10 text-white sm:px-10">
          <p className="text-sm uppercase tracking-[0.24em] text-white/70">Активация доступа</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight">
            {invite ? "Завершите активацию аккаунта" : "Ссылка активации"}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
            {invite
              ? "Создайте пароль для первого входа, чтобы завершить настройку аккаунта и открыть доступ к платформе."
              : "Мы не смогли найти активное приглашение. Возможно, ссылка устарела или уже была использована."}
          </p>

          <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <p className="text-xs uppercase tracking-[0.22em] text-white/60">Данные аккаунта</p>
            <p className="mt-2 text-lg font-medium">{invite?.user.name ?? "Аккаунт не найден"}</p>
            <p className="mt-3 text-sm text-white/75">Логин: {invite?.user.login ?? "Не удалось определить"}</p>
            <p className="mt-1 text-sm text-white/75">Email: {invite?.email ?? "Не удалось определить"}</p>
          </div>
        </section>

        <section className="px-8 py-10 sm:px-10">
          {isAvailable ? (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-[var(--ink)]">Задайте пароль</h2>
                <p className="mt-2 text-sm text-[var(--ink-muted)]">
                  После сохранения пароль будет установлен для вашего первого входа, а аккаунт станет активным.
                </p>
              </div>

              {sp.error ? (
                <p className="mt-6 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                  {sp.error}
                </p>
              ) : null}

              <form action={activateUserAccount} className="mt-8 space-y-4">
                <input type="hidden" name="token" value={token} />

                <Field label="Новый пароль" htmlFor="password" hint={passwordHint}>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={securitySettings.passwordMinLength}
                  />
                </Field>

                <Button type="submit" className="w-full">
                  Активировать аккаунт
                </Button>
              </form>
            </>
          ) : (
            <div>
              <h2 className="text-2xl font-semibold text-[var(--ink)]">Ссылка недоступна</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
                {!invite
                  ? "Мы не нашли это приглашение. Возможно, ссылка была заменена новой или удалена."
                  : invite.status === "ACCEPTED"
                    ? "Этот аккаунт уже активирован. Если пароль уже задан, просто войдите в систему."
                    : isExpired
                      ? "Срок действия ссылки активации истек. Попросите администратора отправить новое приглашение."
                      : "Ссылка активации больше не активна. Попросите администратора отправить новое приглашение."}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/login" className={buttonStyles("primary")}>
                  Перейти ко входу
                </Link>
                <Link href="/" className={buttonStyles("secondary")}>
                  На портал
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
