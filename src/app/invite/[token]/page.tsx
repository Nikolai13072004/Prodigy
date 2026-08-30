import Link from "next/link";
import { auth } from "@/auth";
import { acceptCourseInvite } from "@/app/actions/invite-actions";
import { InviteSignOutButton } from "@/app/invite/[token]/InviteSignOutButton";
import { hashCourseInviteToken } from "@/lib/course-invites";
import { buildPasswordPolicyHint, getPlatformSecuritySettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";
import { Button, Field, Input, buttonStyles } from "@/components/ui";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function CourseInvitePage({ params, searchParams }: Props) {
  const { token } = await params;
  const [sp, session, securitySettings, invite] = await Promise.all([
    searchParams,
    auth(),
    getPlatformSecuritySettings(),
    prisma.courseInvite.findUnique({
      where: { tokenHash: hashCourseInviteToken(token) },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
      },
    }),
  ]);

  const isAvailable = Boolean(invite && invite.status === "PENDING");
  const isSignedIn = Boolean(session?.user);
  const passwordHint = buildPasswordPolicyHint(securitySettings);
  const accessSummary = invite
    ? invite.accessExpiresAt
      ? `Доступ к курсу будет открыт до ${invite.accessExpiresAt.toLocaleDateString("ru-RU")}.`
      : "Доступ к курсу будет предоставлен без ограничения по сроку."
    : null;
  const suggestedLogin = invite?.email.split("@")[0]?.trim().toLowerCase() ?? "";

  return (
    <main className="flex min-h-screen items-center bg-[var(--canvas)] px-4 py-10">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(12,42,82,0.16)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-[#0c2a52] px-8 py-10 text-white sm:px-10">
          <p className="text-sm uppercase tracking-[0.24em] text-white/70">Приглашение на обучение</p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight">
            {invite ? invite.course.title : "Приглашение на курс"}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/80">
            {invite?.course.description ||
              "Завершите регистрацию, чтобы получить доступ к курсу и начать обучение в системе."}
          </p>

          <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <p className="text-xs uppercase tracking-[0.22em] text-white/60">Email приглашения</p>
            <p className="mt-2 text-lg font-medium">{invite?.email ?? "Не удалось определить email"}</p>
            <p className="mt-4 text-sm text-white/75">
              После регистрации курс автоматически появится в разделе <span className="font-medium">Мои курсы</span>.
            </p>
            {accessSummary ? <p className="mt-3 text-sm text-white/75">{accessSummary}</p> : null}
          </div>
        </section>

        <section className="px-8 py-10 sm:px-10">
          {isAvailable ? (
            <>
              <div>
                <h2 className="text-2xl font-semibold text-[var(--ink)]">Завершите регистрацию</h2>
                <p className="mt-2 text-sm text-[var(--ink-muted)]">
                  Укажите имя, логин и пароль. Email уже привязан к этому приглашению.
                </p>
              </div>

              {sp.error ? (
                <p className="mt-6 rounded-2xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                  {sp.error}
                </p>
              ) : null}

              {isSignedIn ? (
                <div className="mt-8 rounded-2xl border border-[var(--warning-soft)] bg-[var(--warning-soft)] px-4 py-4">
                  <p className="text-sm font-medium text-[var(--warning)]">
                    Сейчас в этом браузере уже выполнен вход.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--warning)]">
                    Чтобы зарегистрировать приглашение для {invite?.email}, сначала выйдите из текущего аккаунта.
                    После выхода эта же ссылка откроется заново.
                  </p>
                  <div className="mt-4">
                    <InviteSignOutButton invitePath={`/invite/${token}`} />
                  </div>
                </div>
              ) : (
                <form action={acceptCourseInvite} className="mt-8 space-y-4">
                  <input type="hidden" name="token" value={token} />

                  <Field label="Имя и фамилия" htmlFor="name">
                    <Input
                      id="name"
                      name="name"
                      required
                      autoComplete="name"
                      placeholder="Например, Алексей Тишин"
                    />
                  </Field>

                  <Field label="Логин" htmlFor="login">
                    <Input
                      id="login"
                      name="login"
                      required
                      autoComplete="off"
                      defaultValue={suggestedLogin}
                      placeholder="Например, a.tishin"
                    />
                  </Field>

                  <Field label="Пароль" htmlFor="password" hint={passwordHint}>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      minLength={securitySettings.passwordMinLength}
                      required
                      autoComplete="new-password"
                    />
                  </Field>

                  <Button type="submit" className="w-full">
                    Зарегистрироваться и открыть курс
                  </Button>
                </form>
              )}
            </>
          ) : (
            <div>
              <h2 className="text-2xl font-semibold text-[var(--ink)]">Ссылка недоступна</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
                {!invite
                  ? "Мы не нашли это приглашение. Возможно, ссылка была заменена новой или удалена."
                  : invite.status === "ACCEPTED"
                    ? "Это приглашение уже использовано. Если аккаунт создан, просто войдите в систему."
                    : "Ссылка приглашения больше не активна. Попросите администратора отправить новое письмо."}
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
