import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { cancelEmailJob, retryEmailJob } from "@/app/admin/reports/email-queue/actions";
import { EmailQueueManualActions } from "@/app/admin/reports/email-queue/EmailQueueManualActions";
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

function statusClass(status: string) {
  if (status === "SENT") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PROCESSING") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "CANCELLED") return "border-zinc-200 bg-zinc-100 text-zinc-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
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
          <Link href="/admin/reports" className="text-sm font-medium text-sky-700 hover:text-sky-900">
            ← К отчетам
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">Очередь email</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Здесь видны письма из таблицы EmailJob: ожидающие отправки, ошибки, текущие попытки и уже отправленные письма.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm">
            Найдено: <span className="font-semibold text-zinc-950">{total}</span>
          </div>
          <a
            href={refreshHref}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Обновить
          </a>
        </div>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-5">
        {STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
          <div key={option.value} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{option.label}</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950">{countByStatus.get(option.value) ?? 0}</p>
          </div>
        ))}
      </section>

      <form className="mt-6 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[220px_minmax(0,1fr)_auto]">
        <label className="block text-sm font-medium text-zinc-700">
          Статус
          <select
            name="status"
            defaultValue={status}
            className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-zinc-700">
          Поиск
          <input
            name="q"
            defaultValue={q}
            placeholder="Email, имя, тема, шаблон или ошибка"
            className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Показать
          </button>
          <Link
            href="/admin/reports/email-queue"
            className="inline-flex h-11 items-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Сбросить
          </Link>
        </div>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {jobs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-600">Писем по текущему фильтру нет.</div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-zinc-200 text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[17%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Письмо</th>
                  <th className="px-4 py-3">Получатель</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Попытки</th>
                  <th className="px-4 py-3">Даты</th>
                  <th className="px-4 py-3">Ошибка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="break-words font-medium leading-5 text-zinc-950">{job.subject}</div>
                      <div className="mt-1 text-xs text-zinc-500">{templateLabel(job.template)}</div>
                      <div className="mt-2 max-h-12 overflow-hidden break-words text-xs leading-4 text-zinc-600">
                        {truncateText(job.textBody, 150)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="break-words font-medium leading-5 text-zinc-950">{job.toName || "Без имени"}</div>
                      <div className="mt-1 break-all text-zinc-600">{job.toEmail}</div>
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
                              className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                            >
                              Повторить
                            </button>
                          </form>
                        ) : null}
                        {job.status !== "SENT" && job.status !== "CANCELLED" ? (
                          <form action={cancelEmailJob.bind(null, job.id)}>
                            <button
                              type="submit"
                              className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-2 text-xs font-medium text-rose-700 hover:bg-rose-100"
                            >
                              Отменить
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                      {job.attempts} / {job.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-zinc-600">
                      <div>Создано: {formatDateTime(job.createdAt)}</div>
                      <div>Следующая: {formatDateTime(job.nextAttemptAt)}</div>
                      <div>Отправлено: {formatDateTime(job.sentAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs leading-5 text-rose-700">
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
