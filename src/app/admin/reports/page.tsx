import Link from "next/link";
import {
  queueMyHrNotificationEmails,
  saveHrNotificationPreferences,
} from "@/app/actions/hr-notification-actions";
import {
  createHrReportSchedule,
  deleteHrReportSchedule,
  toggleHrReportSchedulePause,
} from "@/app/actions/hr-report-schedule-actions";
import { requirePermission } from "@/lib/auth-guards";
import { getHrNotificationFeed, type HrNotificationItem } from "@/lib/hr-notifications";
import { formatDateTimeRu, getLearnersReportData } from "@/lib/learners-report";
import { getHrReportSchedulesForUser, HR_REPORT_SCHEDULE_TYPES, type HrReportScheduleView } from "@/lib/hr-report-schedules";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

const LEARNER_PROGRESS_REPORT_PATH = "/admin/reports/learner-progress";
const ANSWERS_ANALYSIS_REPORT_PATH = "/admin/reports/answers-analysis";
const FEEDBACK_REPORT_PATH = "/admin/reports/feedback";
const EMAIL_QUEUE_REPORT_PATH = "/admin/reports/email-queue";
const GROUP_COMPARISON_REPORT_PATH = "/admin/reports/group-comparison";
const PROBLEM_REPORT_PATH = "/admin/reports/problems";

type Props = {
  searchParams: Promise<{
    scheduleNotice?: string;
    scheduleError?: string;
    notificationsSaved?: string;
    notificationEmailStatus?: string;
    notificationEmailCount?: string;
  }>;
};

export default async function AdminReportsPage({ searchParams }: Props) {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const sp = await searchParams;
  const [learnersReport, notifications, schedules, publishedCourses, feedbackCount, queuedEmailCount, groupCount, problemCount] = await Promise.all([
    getLearnersReportData({
      q: "",
      statusFilter: "all",
      groupId: "",
      departmentId: "",
      registeredFrom: "",
      registeredTo: "",
    }),
    getHrNotificationFeed(session.user.id),
    getHrReportSchedulesForUser(session.user.id),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.courseFeedback.count(),
    prisma.emailJob.count({
      where: { status: { in: ["PENDING", "FAILED", "PROCESSING"] } },
    }),
    prisma.group.count(),
    prisma.quizAttempt.count({ where: { outcome: "PENDING_REVIEW" } }),
  ]);
  const activeScheduleCount = schedules.filter((schedule) => !schedule.isPaused).length;
  const reportRows = [
    {
      title: "Прогресс учащихся",
      description:
        "Назначения, средний прогресс, статусы обучения, группы, подразделения и быстрый переход в карточку ученика.",
      metric: `${learnersReport.summary.total} учеников`,
      metricClassName: "bg-emerald-50 text-emerald-700",
      href: LEARNER_PROGRESS_REPORT_PATH,
    },
    {
      title: "Анализ ответов",
      description:
        "Попытки по тестам выбранного курса, средний балл, проходной порог и распределение ответов по вопросам.",
      metric: `${publishedCourses.length} курсов`,
      metricClassName: "bg-sky-50 text-sky-700",
      href: ANSWERS_ANALYSIS_REPORT_PATH,
    },
    {
      title: "Отчет по отзывам",
      description:
        "Оценки курсов, комментарии учеников, отзывы на модерации и поиск курсов с низкой обратной связью.",
      metric: `${feedbackCount} отзывов`,
      metricClassName: "bg-amber-50 text-amber-700",
      href: FEEDBACK_REPORT_PATH,
    },
    {
      title: "Очередь email",
      description:
        "Все системные письма: кому отправляется, статус, попытки, ближайшая повторная отправка и текст последней ошибки.",
      metric: `${queuedEmailCount} активных`,
      metricClassName: "bg-rose-50 text-rose-700",
      href: EMAIL_QUEUE_REPORT_PATH,
    },
    {
      title: "Сравнение групп",
      description:
        "Сравнение групп по назначению выбранного курса, завершениям, прогрессу и тем, кто еще не начал обучение.",
      metric: `${groupCount} групп`,
      metricClassName: "bg-cyan-50 text-cyan-700",
      href: GROUP_COMPARISON_REPORT_PATH,
    },
    {
      title: "Проблемный отчет",
      description:
        "Работы на проверке, проваленные тесты, истекшие доступы и ошибки email в одном списке для быстрой реакции.",
      metric: `${problemCount} на проверке`,
      metricClassName: "bg-rose-50 text-rose-700",
      href: PROBLEM_REPORT_PATH,
    },
  ];

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Отчеты HR</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Здесь собраны ключевые HR-отчеты, уведомления и ежемесячные рассылки. Прогресс учащихся вынесен в
            отдельный отчет с фильтрами и экспортом.
          </p>
        </div>

        <Link
          href="/analytics"
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Открыть аналитику
        </Link>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="divide-y divide-zinc-200">
          {reportRows.map((report) => (
            <Link
              key={report.title}
              href={report.href}
              aria-label={`Открыть «${report.title}»`}
              className="grid gap-4 px-5 py-5 transition hover:bg-zinc-50 sm:px-6 lg:grid-cols-[minmax(0,1fr)_150px] lg:items-center"
            >
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-zinc-950">{report.title}</h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">{report.description}</p>
              </div>

              <div className="flex items-center gap-3 lg:justify-end">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${report.metricClassName}`}>
                  {report.metric}
                </span>
                <span className="text-sm font-medium text-sky-700">Открыть «{report.title}»</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="hr-notifications" className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-950">HR-уведомления</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Лента сигналов по завершениям, низкой активности и скорому окончанию доступа. Здесь же можно настроить
              правила и поставить письма в очередь.
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
              Скоро истекает доступ: {notifications.summary.accessExpiring}
            </span>
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <form action={saveHrNotificationPreferences} className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <input type="hidden" name="returnTo" value="/admin/reports#hr-notifications" />

            <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                name="notifyCourseCompleted"
                defaultChecked={notifications.preferences.notifyCourseCompleted}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">Ученик завершил курс</span>
                <span className="mt-1 block text-xs text-zinc-500">Показывать завершения курсов за последние 30 дней.</span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                name="notifyLowActivity"
                defaultChecked={notifications.preferences.notifyLowActivity}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">Низкая активность</span>
                <span className="mt-1 block text-xs text-zinc-500">Показывать учеников, которые давно не заходили в курс.</span>
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
                className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <input
                type="checkbox"
                name="notifyAccessExpiring"
                defaultChecked={notifications.preferences.notifyAccessExpiring}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">Скоро истекает доступ</span>
                <span className="mt-1 block text-xs text-zinc-500">Показывать учеников, у которых скоро закончится доступ.</span>
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">Предупреждать об истечении доступа за, дней</span>
              <input
                name="accessExpiringDays"
                type="number"
                min={1}
                max={180}
                defaultValue={notifications.preferences.accessExpiringDays}
                className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Сохранить настройки
            </button>
          </form>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-950">Текущие события</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  {notifications.summary.total
                    ? `В ленте сейчас ${notifications.summary.total} активных событий.`
                    : "Пока нет событий, которые требуют внимания HR."}
                </p>
              </div>

              <form action={queueMyHrNotificationEmails}>
                <input type="hidden" name="returnTo" value="/admin/reports#hr-notifications" />
                <button
                  type="submit"
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Поставить email-уведомления в очередь
                </button>
              </form>
            </div>

            {notifications.items.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-6 text-sm text-zinc-600">
                Событий пока нет.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {notifications.items.map((item) => (
                  <article key={item.notificationKey} className="rounded-xl border border-zinc-200 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={item.href} className="text-sm font-semibold text-zinc-950 hover:text-sky-700 hover:underline">
                          {getHrNotificationLinkLabel(item)}
                        </Link>
                        <p className="mt-1 text-sm text-zinc-600">{item.description}</p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {item.courseTitle} · {formatDateTimeRu(item.occurredAt)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getHrNotificationTone(item.type)}`}>
                        {getHrNotificationTypeLabel(item.type)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="report-schedules" className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Расписания отчетов</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Ежемесячная рассылка формируется 1-го числа в 09:00. Получатели получают email-сводку и ссылку на отчет
                в LMS.
              </p>
            </div>
            <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
              {activeScheduleCount} активных
            </div>
          </div>

          {sp.scheduleNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {sp.scheduleNotice}
            </div>
          ) : null}

          {sp.scheduleError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {sp.scheduleError}
            </div>
          ) : null}

          <form action={createHrReportSchedule} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Тип отчета</span>
              <select
                name="reportType"
                defaultValue={HR_REPORT_SCHEDULE_TYPES.COURSE_SUMMARY}
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              >
                <option value={HR_REPORT_SCHEDULE_TYPES.COURSE_SUMMARY}>Сводный отчет по курсам</option>
                <option value={HR_REPORT_SCHEDULE_TYPES.COURSE_RESULTS}>Отчет по конкретному курсу</option>
                <option value={HR_REPORT_SCHEDULE_TYPES.ANSWERS_ANALYSIS}>Анализ ответов по курсу</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Курс</span>
              <select
                name="courseId"
                defaultValue=""
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-emerald-500 focus:ring-2"
              >
                <option value="">Не нужен для сводного отчета</option>
                {publishedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Получатели</span>
              <textarea
                name="recipients"
                rows={5}
                placeholder={"lead@example.com\nowner@example.com"}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                По одному email на строку или через запятую. До 20 адресов в одном расписании.
              </span>
            </label>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Формат MVP: email-сводка с ключевыми метриками и ссылкой на отчет. CSV/PDF можно будет добавить следующим
              этапом.
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Сохранить расписание
            </button>
          </form>

          <p className="mt-3 text-xs text-zinc-500">
            Для фоновой постановки ежемесячных рассылок запускайте
            <span className="font-mono"> npm run hr:report-schedules</span> и
            <span className="font-mono"> npm run email:worker</span>.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Текущие расписания</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Здесь можно приостановить или удалить сохраненную рассылку без потери истории отправки.
              </p>
            </div>
          </div>

          {schedules.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center text-sm text-zinc-700">
              Пока нет ни одного сохраненного расписания.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {schedules.map((schedule) => (
                <ReportScheduleCard key={schedule.id} schedule={schedule} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function ReportScheduleCard({ schedule }: { schedule: HrReportScheduleView }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-950">{schedule.reportTypeLabel}</span>
            <ReportScheduleStatusBadge isPaused={schedule.isPaused} />
          </div>
          <p className="mt-2 text-sm text-zinc-600">Получатели: {schedule.recipients.join(", ")}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>Следующая отправка: {formatDateTimeRu(schedule.nextRunAt)}</span>
            <span>Последняя: {schedule.lastSentAt ? formatDateTimeRu(schedule.lastSentAt) : "еще не отправляли"}</span>
            <span>Создано: {formatDateTimeRu(schedule.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={toggleHrReportSchedulePause.bind(null, schedule.id)}>
            <input type="hidden" name="mode" value={schedule.isPaused ? "resume" : "pause"} />
            <button
              type="submit"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              {schedule.isPaused ? "Возобновить" : "Приостановить"}
            </button>
          </form>
          <form action={deleteHrReportSchedule.bind(null, schedule.id)}>
            <button
              type="submit"
              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              Удалить
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReportScheduleStatusBadge({ isPaused }: { isPaused: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        isPaused ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {isPaused ? "Приостановлено" : "Активно"}
    </span>
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

function getHrNotificationTypeLabel(type: HrNotificationItem["type"]) {
  if (type === "course_completed") return "Завершение";
  if (type === "low_activity") return "Низкая активность";
  return "Скоро истекает доступ";
}

function getHrNotificationTone(type: HrNotificationItem["type"]) {
  if (type === "course_completed") return "bg-emerald-100 text-emerald-700";
  if (type === "low_activity") return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

function getHrNotificationLinkLabel(item: HrNotificationItem) {
  if (item.type === "access_expiring") {
    return `Скоро истекает доступ ${item.learnerName}`;
  }

  return item.title;
}
