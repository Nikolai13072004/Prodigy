import Link from "next/link";

import type { CourseManagementData } from "./_queries/get-course-management-data";
import type {
  CourseRequiredQuizReport,
  RequiredQuizStatus,
} from "./_queries/select-course-report";

type Props = {
  courseId: string;
  metrics: { totalAttempts: number; passedAttempts: number; usersWithAttempts: number };
  requiredQuizReport: CourseRequiredQuizReport;
  courseVersionDiff: string[];
  attempts: CourseManagementData["reportAttempts"];
  emailJobs: CourseManagementData["courseEmailJobs"];
};

export function CourseReportsSection({
  courseId,
  metrics,
  requiredQuizReport,
  courseVersionDiff,
  attempts,
  emailJobs,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ink)]">Отчёты</h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">
            Сводка по попыткам, письмам курса и изменениям между опубликованной версией и текущим черновиком.
          </p>
        </div>
        <Link
          href={`/courses/${courseId}/export`}
          className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
        >
          Экспорт пакета курса
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Всего попыток" value={metrics.totalAttempts} />
        <Metric label="Успешных" value={metrics.passedAttempts} />
        <Metric label="Участников" value={metrics.usersWithAttempts} />
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--ink)]">Статусы по ученикам</h3>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Для каждого назначенного ученика видно, пройден ли курс и сдан ли обязательный тест.
            </p>
          </div>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
            Назначенных учеников: {requiredQuizReport.summary.assignedLearners}
          </span>
        </div>

        {requiredQuizReport.hasRequiredQuiz ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <SummaryPill label="Сдали" value={requiredQuizReport.summary.passed} tone="emerald" />
              <SummaryPill label="Не сдали" value={requiredQuizReport.summary.failed} tone="rose" />
              <SummaryPill label="В работе" value={requiredQuizReport.summary.inProgress} tone="amber" />
              <SummaryPill label="На проверке" value={requiredQuizReport.summary.pendingReview} tone="violet" />
              <SummaryPill label="Не начинали" value={requiredQuizReport.summary.notStarted} tone="zinc" />
            </div>
            {requiredQuizReport.rows.length === 0 ? (
              <Empty message="Для этого курса пока нет назначенных учеников." />
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                      <tr>
                        <Header>Ученик</Header>
                        <Header>Подразделение</Header>
                        <Header>Дата записи</Header>
                        <Header>Курс</Header>
                        <Header>Тест</Header>
                        <th className="px-4 py-3 text-right font-medium">Детали</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requiredQuizReport.rows.map((row) => (
                        <tr key={row.id} className="border-t border-[var(--line)] align-top text-[var(--ink)]">
                          <td className="px-4 py-4">
                            <div className="font-medium text-[var(--ink)]">{row.name}</div>
                            <div className="mt-1 text-xs text-[var(--ink-muted)]">{row.login}</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-[var(--ink-muted)]">{row.department}</td>
                          <td className="px-4 py-4 text-xs text-[var(--ink-muted)]">
                            {row.assignedAt ? row.assignedAt.toLocaleString("ru-RU") : "—"}
                          </td>
                          <td className="px-4 py-4"><CourseStatus completed={row.courseCompleted} /></td>
                          <td className="px-4 py-4"><QuizStatus label={row.statusLabel} status={row.status} /></td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`/courses/${courseId}/learners/${row.id}`}
                              className="inline-flex rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                            >
                              Открыть
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <Empty message="В этом курсе нет обязательного теста." />
        )}
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
        <SectionHeading title="Версия курса" count={`${courseVersionDiff.length} изменений`} />
        {courseVersionDiff.length === 0 ? (
          <Empty message="Черновик совпадает с опубликованной версией или курс ещё не публиковался." />
        ) : (
          <ul className="mt-4 space-y-2">
            {courseVersionDiff.map((entry) => (
              <li key={entry} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)]">
                {entry}
              </li>
            ))}
          </ul>
        )}
      </section>

      {attempts.length === 0 ? (
        <Empty message="Попыток прохождения тестов пока нет." />
      ) : (
        <ul className="space-y-3">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">{attempt.quizTitle}</p>
                  <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">
                    {attempt.user.name} <span className="font-normal text-[var(--ink-muted)]">({attempt.user.login})</span>
                  </h3>
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">
                    Попытка {attempt.attemptNumber} · {attempt.correctAnswers}/{attempt.totalQuestions} правильных ответов
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <AttemptStatus outcome={attempt.outcome} />
                  <span className="text-[var(--ink-muted)]">{attempt.completedAt.toLocaleString("ru-RU")}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
        <SectionHeading title="Журнал писем по курсу" count={`${emailJobs.length} писем`} />
        {emailJobs.length === 0 ? (
          <Empty message="Писем по этому курсу пока нет." />
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--line)]">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-[var(--surface)] text-[var(--ink-muted)]">
                  <tr><Header>Дата</Header><Header>Получатель</Header><Header>Тема</Header><Header>Статус</Header></tr>
                </thead>
                <tbody>
                  {emailJobs.map((job) => (
                    <tr key={job.id} className="border-t border-[var(--line)] align-top text-[var(--ink)]">
                      <td className="px-4 py-4 text-xs text-[var(--ink-muted)]">{(job.sentAt ?? job.createdAt).toLocaleString("ru-RU")}</td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-[var(--ink)]">{job.toName || job.toEmail}</div>
                        {job.toName ? <div className="mt-1 text-xs text-[var(--ink-muted)]">{job.toEmail}</div> : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-[var(--ink)]">{job.subject}</div>
                        <div className="mt-1 text-xs text-[var(--ink-muted)]">
                          {job.template ?? "Без шаблона"} · попыток: {job.attempts}{job.lastError ? ` · ${job.lastError}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4"><EmailStatus status={job.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Header({ children }: { children: string }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><div className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</div><div className="mt-1 text-sm text-[var(--ink-muted)]">{label}</div></div>;
}

function SectionHeading({ title, count }: { title: string; count: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3><span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">{count}</span></div>;
}

function Empty({ message }: { message: string }) {
  return <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--ink-muted)]">{message}</p>;
}

function CourseStatus({ completed }: { completed: boolean }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${completed ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]"}`}>{completed ? "Завершён" : "Не завершён"}</span>;
}

function QuizStatus({ label, status }: { label: string; status: RequiredQuizStatus }) {
  const styles: Record<RequiredQuizStatus, string> = { PASSED: "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]", FAILED: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]", PENDING_REVIEW: "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]", IN_PROGRESS: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]", NOT_STARTED: "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]", NO_TEST: "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]" };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{label}</span>;
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" | "amber" | "violet" | "zinc" }) {
  const styles = { emerald: "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]", rose: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]", amber: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]", violet: "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]", zinc: "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]" };
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${styles[tone]}`}><span>{label}</span><span>{value}</span></span>;
}

function AttemptStatus({ outcome }: { outcome: string }) {
  const style = outcome === "PASSED" ? "bg-[var(--success-soft)] text-[var(--success)]" : outcome === "FAILED" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : outcome === "PENDING_REVIEW" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--surface)] text-[var(--ink)]";
  const label = outcome === "PASSED" ? "Сдан" : outcome === "FAILED" ? "Не сдан" : outcome === "PENDING_REVIEW" ? "На проверке" : "Попытка";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>{label}</span>;
}

function EmailStatus({ status }: { status: string }) {
  const style = status === "SENT" ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]" : status === "FAILED" ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]" : status === "PROCESSING" ? "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]" : "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]";
  const label = status === "SENT" ? "Отправлено" : status === "FAILED" ? "Ошибка" : status === "PROCESSING" ? "Отправляется" : "В очереди";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}
