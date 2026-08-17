import Link from "next/link";
import { auth } from "@/auth";
import { acceptCourseInvite } from "@/app/actions/invite-actions";
import { InviteSignOutButton } from "@/app/invite/[token]/InviteSignOutButton";
import { hashCourseInviteToken } from "@/lib/course-invites";
import { buildPasswordPolicyHint, getPlatformSecuritySettings } from "@/lib/platform-settings";
import prisma from "@/lib/prisma";

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
    <main className="flex min-h-screen items-center bg-[#dfeaf7] px-4 py-10">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-3xl border border-[#c7d8ec] bg-white shadow-[0_24px_60px_rgba(12,42,82,0.16)] lg:grid-cols-[1.1fr_0.9fr]">
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
                <h2 className="text-2xl font-semibold text-zinc-950">Завершите регистрацию</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Укажите имя, логин и пароль. Email уже привязан к этому приглашению.
                </p>
              </div>

              {sp.error ? (
                <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {sp.error}
                </p>
              ) : null}

              {isSignedIn ? (
                <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm font-medium text-amber-900">
                    Сейчас в этом браузере уже выполнен вход.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
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

                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-zinc-700">
                      Имя и фамилия
                    </label>
                    <input
                      id="name"
                      name="name"
                      required
                      autoComplete="name"
                      placeholder="Например, Алексей Тишин"
                      className="mt-1.5 w-full rounded-2xl border border-[#bfd2e8] px-4 py-3 text-sm outline-none ring-[#008db3] focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="login" className="block text-sm font-medium text-zinc-700">
                      Логин
                    </label>
                    <input
                      id="login"
                      name="login"
                      required
                      autoComplete="off"
                      defaultValue={suggestedLogin}
                      placeholder="Например, a.tishin"
                      className="mt-1.5 w-full rounded-2xl border border-[#bfd2e8] px-4 py-3 text-sm outline-none ring-[#008db3] focus:ring-2"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
                      Пароль
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      minLength={securitySettings.passwordMinLength}
                      required
                      autoComplete="new-password"
                      className="mt-1.5 w-full rounded-2xl border border-[#bfd2e8] px-4 py-3 text-sm outline-none ring-[#008db3] focus:ring-2"
                    />
                    <p className="mt-1.5 text-xs text-zinc-500">{passwordHint}</p>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-[#008db3] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#007fa8]"
                  >
                    Зарегистрироваться и открыть курс
                  </button>
                </form>
              )}
            </>
          ) : (
            <div>
              <h2 className="text-2xl font-semibold text-zinc-950">Ссылка недоступна</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {!invite
                  ? "Мы не нашли это приглашение. Возможно, ссылка была заменена новой или удалена."
                  : invite.status === "ACCEPTED"
                    ? "Это приглашение уже использовано. Если аккаунт создан, просто войдите в систему."
                    : "Ссылка приглашения больше не активна. Попросите администратора отправить новое письмо."}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Перейти ко входу
                </Link>
                <Link
                  href="/"
                  className="inline-flex rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
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
