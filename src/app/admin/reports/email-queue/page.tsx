import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { cancelEmailJob, retryEmailJob } from "@/app/admin/reports/email-queue/actions";
import { EmailQueueManualActions } from "@/app/admin/reports/email-queue/EmailQueueManualActions";
import { Badge, type BadgeTone } from "@/components/ui";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

type Props = {
  searchParams: Promise<{
    status?: string;
    q?: string;
  }>;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "PENDING", label: "В очереди" },
  { value: "PROCESSING", label: "Отправляется" },
  { value: "FAILED", label: "Ошибка" },
  { value: "SENT", label: "Отправлено" },
  { value: "CANCELLED", label: "Отменено" },
] as const;

const TEMPLATE_LABELS: Record<string, string> = {
  COURSE_ASSIGNED: "Назначение курса",
  COURSE_ACCESS_EXTENDED: "Продление доступа",
  COURSE_BROADCAST: "Сообщение по курсу",
  COURSE_INVITE: "Приглашение на курс",
  COURSE_REMINDER_NOT_STARTED: "Напоминание: курс не начат",
  COURSE_REMINDER_EXPIRING: "Напоминание: срок истекает",
  COURSE_REMINDER_EXPIRED: "Напоминание: срок истек",
  COURSE_REMINDER_QUIZ_FAILED: "Напоминание: тест не сдан",
  HR_NOTIFICATION: "HR-уведомление",
  HR_SCHEDULED_REPORT: "Плановый HR-отчет",
  QUIZ_REVIEWED: "Проверка задания",
  STUDENT_INVITE: "Приглашение ученика",
  USER_ACCESS: "Доступ пользователя",
  USER_ACTIVATION: "Активация аккаунта",
};

function getStatusParam(value?: string) {
  return STATUS_OPTIONS.some((option) => option.value === value) ? value ?? "all" : "all";
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function statusLabel(status: string) {
  if (status === "SENT") return "Отправлено";
  if (status === "PROCESSING") return "Отправляется";
  if (status === "FAILED") return "Ошибка";
  if (status === "PENDING") return "В очереди";
  if (status === "CANCELLED") return "Отменено";
  return status;
}

function statusTone(status: string): BadgeTone {
  if (status === "SENT") return "success";
  if (status === "PROCESSING") return "info";
  if (status === "FAILED") return "danger";
  if (status === "CANCELLED") return "neutral";
  return "warning";
}

function templateLabel(template?: string | null) {
  if (!template) return "Системное письмо";
  return TEMPLATE_LABELS[template] ?? template;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export default async function AdminEmailQueuePage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const sp = await searchParams;
  const status = getStatusParam(sp.status);
  const q = (sp.q ?? "").trim();

  const where: Prisma.EmailJobWhereInput = {
    ...(status !== "all" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { toEmail: { contains: q } },
            { toName: { contains: q } },
            { subject: { contains: q } },
            { template: { contains: q } },
            { payloadJson: { contains: q } },
            { lastError: { contains: q } },
          ],
        }
      : {}),
  };

  const [jobs, counts, total] = await Promise.all([
    prisma.emailJob.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        toEmail: true,
        toName: true,
        subject: true,
        htmlBody: true,
        textBody: true,
        template: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        lastError: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.emailJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.emailJob.count({ where }),
  ]);

  const refreshParams = new URLSearchParams();
  if (status !== "all") refreshParams.set("status", status);
  if (q) refreshParams.set("q", q);
  const refreshQuery = refreshParams.toString();
  const refreshHref = refreshQuery ? `/admin/reports/email-queue?${refreshQuery}` : "/admin/reports/email-queue";

  const countByStatus = new Map(counts.map((item) => [item.status, item._count._all]));

  return (
    <main className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/reports" className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-strong)]">
            ← К отчетам
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)]">Очередь email</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
            Здесь видны письма из таблицы EmailJob: ожидающие отправки, ошибки, текущие попытки и уже отправленные письма.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--ink-muted)] shadow-sm">
            Найдено: <span className="font-semibold text-[var(--ink)]">{total}</span>
          </div>
          <a
            href={refreshHref}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--ink)] shadow-sm hover:bg-[var(--accent-soft)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Обновить
          </a>
        </div>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-5">
        {STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
          <div key={option.value} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">{option.label}</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{countByStatus.get(option.value) ?? 0}</p>
          </div>
        ))}
      </section>

      <form className="mt-6 grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm md:grid-cols-[220px_minmax(0,1fr)_auto]">
        <label className="block text-sm font-medium text-[var(--ink)]">
          Статус
          <select
            name="status"
            defaultValue={status}
            className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-[var(--ink)]">
          Поиск
          <input
            name="q"
            defaultValue={q}
            placeholder="Email, имя, тема, шаблон или ошибка"
            className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Показать
          </button>
          <Link
            href="/admin/reports/email-queue"
            className="inline-flex h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            Сбросить
          </Link>
        </div>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
        {jobs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--ink-muted)]">Писем по текущему фильтру нет.</div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-[var(--line)] text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[17%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="bg-[var(--surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Письмо</th>
                  <th className="px-4 py-3">Получатель</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Попытки</th>
                  <th className="px-4 py-3">Даты</th>
                  <th className="px-4 py-3">Ошибка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {jobs.map((job) => (
                  <tr key={job.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="break-words font-medium leading-5 text-[var(--ink)]">{job.subject}</div>
                      <div className="mt-1 text-xs text-[var(--ink-muted)]">{templateLabel(job.template)}</div>
                      <div className="mt-2 max-h-12 overflow-hidden break-words text-xs leading-4 text-[var(--ink-muted)]">
                        {truncateText(job.textBody, 150)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="break-words font-medium leading-5 text-[var(--ink)]">{job.toName || "Без имени"}</div>
                      <div className="mt-1 break-all text-[var(--ink-muted)]">{job.toEmail}</div>
                      <EmailQueueManualActions
                        toEmail={job.toEmail}
                        subject={job.subject}
                        body={job.textBody}
                        htmlBody={job.htmlBody}
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {job.status === "FAILED" || job.status === "CANCELLED" ? (
                          <form action={retryEmailJob.bind(null, job.id)}>
                            <button
                              type="submit"
                              className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-[var(--success)] bg-[var(--success-soft)] px-2 text-xs font-medium text-[var(--success)] hover:opacity-90"
                            >
                              Повторить
                            </button>
                          </form>
                        ) : null}
                        {job.status !== "SENT" && job.status !== "CANCELLED" ? (
                          <form action={cancelEmailJob.bind(null, job.id)}>
                            <button
                              type="submit"
                              className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-2 text-xs font-medium text-[var(--danger)] hover:opacity-90"
                            >
                              Отменить
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(job.status)}>{statusLabel(job.status)}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--ink)]">
                      {job.attempts} / {job.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-[var(--ink-muted)]">
                      <div>Создано: {formatDateTime(job.createdAt)}</div>
                      <div>Следующая: {formatDateTime(job.nextAttemptAt)}</div>
                      <div>Отправлено: {formatDateTime(job.sentAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-[var(--danger)]">
                      <div className="max-h-16 overflow-hidden break-words">
                        {job.lastError ? truncateText(job.lastError, 160) : "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
