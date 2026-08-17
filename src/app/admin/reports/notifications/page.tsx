import Link from "next/link";
import { queueMyHrNotificationEmails, saveHrNotificationPreferences } from "@/app/actions/hr-notification-actions";
import { requirePermission } from "@/lib/auth-guards";
import { buildHrNotificationMailtoDraft, getHrNotificationFeed } from "@/lib/hr-notifications";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

type Props = {
  searchParams: Promise<{
    notificationsSaved?: string;
    notificationEmailStatus?: string;
    notificationEmailCount?: string;
  }>;
};

export default async function HrNotificationSettingsPage({ searchParams }: Props) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const [sp, notifications, recipient] = await Promise.all([
    searchParams,
    getHrNotificationFeed(session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
  ]);
  const localMailDraft = notifications.items[0]
    ? buildHrNotificationMailtoDraft({
        item: notifications.items[0],
        preferences: notifications.preferences,
        recipientName: recipient?.name ?? session.user.name,
        recipientEmail: recipient?.email,
        itemCount: notifications.items.length,
      })
    : null;

  return (
    <main className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/admin/reports#hr-notifications"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
        >
          ←
          <span className="sr-only">К отчетам</span>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">HR-уведомления</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Настройте события, по которым HR получает сигналы в ленте и email-уведомления.
          </p>
        </div>
      </div>

      {sp.notificationsSaved ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Настройки уведомлений сохранены.
        </div>
      ) : null}

      {sp.notificationEmailStatus ? (
        <NotificationEmailStatusMessage
          status={sp.notificationEmailStatus}
          count={Number(sp.notificationEmailCount ?? 0)}
        />
      ) : null}

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Настройки событий</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Сейчас в ленте по этим правилам найдено {notifications.summary.total} событий.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700">
              Завершения: {notifications.summary.completed}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
              Низкая активность: {notifications.summary.lowActivity}
            </span>
            <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">
              Доступ: {notifications.summary.accessExpiring}
            </span>
          </div>
        </div>

        <form action={saveHrNotificationPreferences} className="mt-5 space-y-4">
          <input type="hidden" name="returnTo" value="/admin/reports/notifications" />
          <label className="flex items-start gap-3 rounded-xl border border-zinc-200 px-4 py-3">
            <input
              type="checkbox"
              name="notifyCourseCompleted"
              defaultChecked={notifications.preferences.notifyCourseCompleted}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">Ученик завершил курс</span>
              <span className="mt-1 block text-xs text-zinc-500">
                Показывать события по завершенным курсам за последние 30 дней.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-zinc-200 px-4 py-3">
            <input
              type="checkbox"
              name="notifyLowActivity"
              defaultChecked={notifications.preferences.notifyLowActivity}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">Низкая активность</span>
              <span className="mt-1 block text-xs text-zinc-500">
                Показывать учеников, которые не заходили в курс дольше заданного порога.
              </span>
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">Порог неактивности, дней</span>
            <input
              name="lowActivityDays"
              type="number"
              min={1}
              max={180}
              defaultValue={notifications.preferences.lowActivityDays}
              className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-zinc-200 px-4 py-3">
            <input
              type="checkbox"
              name="notifyAccessExpiring"
              defaultChecked={notifications.preferences.notifyAccessExpiring}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">Скоро истекает доступ</span>
              <span className="mt-1 block text-xs text-zinc-500">
                Показывать учеников, у которых активный доступ к курсу скоро закончится.
              </span>
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-700">
              Предупреждать об истечении доступа за, дней
            </span>
            <input
              name="accessExpiringDays"
              type="number"
              min={1}
              max={180}
              defaultValue={notifications.preferences.accessExpiringDays}
              className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Сохранить настройки
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Email-уведомления</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Письма попадают в существующую очередь отправки. Для регулярной отправки используйте фоновые worker-команды.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {localMailDraft ? (
            <a
              href={localMailDraft.href}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              Открыть письмо в почтовике
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-400"
            >
              Нет событий для письма
            </button>
          )}

          <form action={queueMyHrNotificationEmails}>
            <input type="hidden" name="returnTo" value="/admin/reports/notifications" />
            <button
              type="submit"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Поставить email-уведомления в очередь
            </button>
          </form>
        </div>

        {localMailDraft ? (
          <p className="mt-3 text-xs text-zinc-500">
            Локальная проверка: письмо не отправляется сервером, используется событие «{localMailDraft.itemTitle}».
            {!localMailDraft.toEmail ? " Адрес получателя можно указать вручную в почтовике." : null}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-zinc-500">
          Команды: <span className="font-mono">npm run hr:notifications</span> и{" "}
          <span className="font-mono">npm run email:worker</span>.
        </p>
      </section>
    </main>
  );
}

function NotificationEmailStatusMessage({ status, count }: { status: string; count: number }) {
  if (status === "queued") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Писем поставлено в очередь: {count}.
      </div>
    );
  }

  if (status === "no_email") {
    return (
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Для текущего HR-пользователя не указан email. Добавьте email в профиле пользователя.
      </div>
    );
  }

  if (status === "already_sent") {
    return (
      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        Новых писем нет: текущие события уже были поставлены в очередь ранее.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
      Новых событий для email-рассылки пока нет.
    </div>
  );
}
