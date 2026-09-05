import Link from "next/link";
import { queueMyHrNotificationEmails, saveHrNotificationPreferences } from "@/app/actions/hr-notification-actions";
import { Badge, Button, Input, buttonStyles } from "@/components/ui";
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-muted)] hover:bg-[var(--surface)]"
        >
          ←
          <span className="sr-only">К отчетам</span>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">HR-уведомления</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Настройте события, по которым HR получает сигналы в ленте и email-уведомления.
          </p>
        </div>
      </div>

      {sp.notificationsSaved ? (
        <div className="mt-6 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          Настройки уведомлений сохранены.
        </div>
      ) : null}

      {sp.notificationEmailStatus ? (
        <NotificationEmailStatusMessage
          status={sp.notificationEmailStatus}
          count={Number(sp.notificationEmailCount ?? 0)}
        />
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Настройки событий</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Сейчас в ленте по этим правилам найдено {notifications.summary.total} событий.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">Завершения: {notifications.summary.completed}</Badge>
            <Badge tone="warning">Низкая активность: {notifications.summary.lowActivity}</Badge>
            <Badge tone="info">Доступ: {notifications.summary.accessExpiring}</Badge>
          </div>
        </div>

        <form action={saveHrNotificationPreferences} className="mt-5 space-y-4">
          <input type="hidden" name="returnTo" value="/admin/reports/notifications" />
          <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
            <input
              type="checkbox"
              name="notifyCourseCompleted"
              defaultChecked={notifications.preferences.notifyCourseCompleted}
              className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">Ученик завершил курс</span>
              <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                Показывать события по завершенным курсам за последние 30 дней.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
            <input
              type="checkbox"
              name="notifyLowActivity"
              defaultChecked={notifications.preferences.notifyLowActivity}
              className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">Низкая активность</span>
              <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                Показывать учеников, которые не заходили в курс дольше заданного порога.
              </span>
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--ink)]">Порог неактивности, дней</span>
            <Input
              name="lowActivityDays"
              type="number"
              min={1}
              max={180}
              defaultValue={notifications.preferences.lowActivityDays}
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
            <input
              type="checkbox"
              name="notifyAccessExpiring"
              defaultChecked={notifications.preferences.notifyAccessExpiring}
              className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">Скоро истекает доступ</span>
              <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                Показывать учеников, у которых активный доступ к курсу скоро закончится.
              </span>
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--ink)]">
              Предупреждать об истечении доступа за, дней
            </span>
            <Input
              name="accessExpiringDays"
              type="number"
              min={1}
              max={180}
              defaultValue={notifications.preferences.accessExpiringDays}
            />
          </label>

          <Button type="submit" className="w-full">
            Сохранить настройки
          </Button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Email-уведомления</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Письма попадают в существующую очередь отправки. Для регулярной отправки используйте фоновые worker-команды.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {localMailDraft ? (
            <a href={localMailDraft.href} className={buttonStyles("primary")}>
              Открыть письмо в почтовике
            </a>
          ) : (
            <Button type="button" disabled variant="secondary">
              Нет событий для письма
            </Button>
          )}

          <form action={queueMyHrNotificationEmails}>
            <input type="hidden" name="returnTo" value="/admin/reports/notifications" />
            <Button type="submit" variant="secondary">
              Поставить email-уведомления в очередь
            </Button>
          </form>
        </div>

        {localMailDraft ? (
          <p className="mt-3 text-xs text-[var(--ink-muted)]">
            Локальная проверка: письмо не отправляется сервером, используется событие «{localMailDraft.itemTitle}».
            {!localMailDraft.toEmail ? " Адрес получателя можно указать вручную в почтовике." : null}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-[var(--ink-muted)]">
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
      <div className="mt-6 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
        Писем поставлено в очередь: {count}.
      </div>
    );
  }

  if (status === "no_email") {
    return (
      <div className="mt-6 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
        Для текущего HR-пользователя не указан email. Добавьте email в профиле пользователя.
      </div>
    );
  }

  if (status === "already_sent") {
    return (
      <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)]">
        Новых писем нет: текущие события уже были поставлены в очередь ранее.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)]">
      Новых событий для email-рассылки пока нет.
    </div>
  );
}
