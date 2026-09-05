import Link from "next/link";
import { reviewQuizAttempt } from "@/app/actions/course-assessment-actions";
import { QuizQuestionMediaViewer } from "@/components/QuizQuestionMediaViewer";
import { Badge, Button, Input, Label, Select, Textarea } from "@/components/ui";
import type {
  CourseManualReviewStatusFilter,
  CourseManualReviewsData,
} from "@/lib/course-manual-reviews";
import { QUESTION_LABELS } from "@/lib/constants";
import { parseQuizQuestionMediaFromConfig } from "@/lib/quiz-question-media";

type Props = {
  courseId: string;
  data: CourseManualReviewsData;
  statusFilter: CourseManualReviewStatusFilter;
};

export function ManualReviewsSection({ courseId, data, statusFilter }: Props) {
  return (
    <div className="space-y-8">
      <SectionIntro
        title="Задания на проверку"
        description="Здесь собраны ответы с ручной проверкой по курсу: эссе и загруженные файлы. Можно открыть работу, выставить баллы, отметить зачтено или не зачтено и оставить комментарий для ученика."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Всего работ" value={String(data.summary.total)} />
        <MetricCard label="Ждут проверки" value={String(data.summary.pending)} accent="amber" />
        <MetricCard label="Проверено" value={String(data.summary.reviewed)} accent="emerald" />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink
          href={buildReviewsHref(courseId, { status: "all", attempt: data.selectedAttempt?.id })}
          label={`Все (${data.summary.total})`}
          active={statusFilter === "all"}
        />
        <FilterLink
          href={buildReviewsHref(courseId, { status: "pending", attempt: data.selectedAttempt?.id })}
          label={`На проверке (${data.summary.pending})`}
          active={statusFilter === "pending"}
        />
        <FilterLink
          href={buildReviewsHref(courseId, { status: "reviewed", attempt: data.selectedAttempt?.id })}
          label={`Проверено (${data.summary.reviewed})`}
          active={statusFilter === "reviewed"}
        />
      </div>

      {data.filteredRows.length === 0 ? (
        <EmptyState statusFilter={statusFilter} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <aside aria-label="Список работ на проверку" className="space-y-3">
            {data.filteredRows.map((row) => {
              const active = row.id === data.selectedAttempt?.id;
              return (
                <Link
                  key={row.id}
                  href={buildReviewsHref(courseId, { status: statusFilter, attempt: row.id })}
                  className={`block rounded-xl border px-4 py-4 transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--line)] hover:bg-[var(--accent-soft)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">{row.quizTitle}</p>
                      <h3 className="mt-1 font-semibold text-[var(--ink)]">{row.learnerName}</h3>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">
                        {row.learnerLogin} · попытка {row.attemptNumber}
                      </p>
                    </div>
                    <ReviewStatusBadge status={row.status} />
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Сдано</dt>
                      <dd className="mt-1 text-[var(--ink)]">{row.submittedAt.toLocaleString("ru-RU")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Ручных вопросов</dt>
                      <dd className="mt-1 text-[var(--ink)]">{row.manualQuestionsCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Проверено</dt>
                      <dd className="mt-1 text-[var(--ink)]">
                        {row.reviewedAt ? row.reviewedAt.toLocaleString("ru-RU") : "Еще нет"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Комментарий</dt>
                      <dd className="mt-1 text-[var(--ink)]">{row.reviewCommentPreview ?? "Без комментария"}</dd>
                    </div>
                  </dl>
                </Link>
              );
            })}
          </aside>

          <section
            aria-label="Детали проверки работы"
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-sm"
          >
            {data.selectedAttempt ? (
              <ReviewDetail
                courseId={courseId}
                statusFilter={statusFilter}
                attempt={data.selectedAttempt}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
                Выберите работу в списке слева, чтобы открыть ответ и выставить оценку.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ReviewDetail({
  courseId,
  statusFilter,
  attempt,
}: {
  courseId: string;
  statusFilter: CourseManualReviewStatusFilter;
  attempt: CourseManualReviewsData["selectedAttempt"];
}) {
  if (!attempt) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">{attempt.quizTitle}</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">{attempt.learnerName}</h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {attempt.learnerLogin}
            {attempt.learnerEmail ? ` · ${attempt.learnerEmail}` : ""}
          </p>
        </div>
        <ReviewStatusBadge status={attempt.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard label="Попытка" value={String(attempt.attemptNumber)} />
        <InfoCard label="Баллы" value={`${attempt.score}/${attempt.maxScore}`} />
        <InfoCard
          label="Правильных ответов"
          value={`${attempt.correctAnswers}/${attempt.totalQuestions}`}
        />
        <InfoCard
          label="Порог сдачи"
          value={`${attempt.minCorrectAnswers} из ${attempt.totalQuestions}`}
        />
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink)]">
        <p>Работа отправлена: {attempt.submittedAt.toLocaleString("ru-RU")}</p>
        {attempt.reviewedAt ? (
          <p className="mt-1">
            Последняя проверка: {attempt.reviewedAt.toLocaleString("ru-RU")}
            {attempt.reviewedByName ? ` · ${attempt.reviewedByName}` : ""}
          </p>
        ) : null}
      </div>

      <form action={reviewQuizAttempt.bind(null, courseId, attempt.id)} className="space-y-6">
        <input type="hidden" name="reviewStatus" value={statusFilter} />

        {attempt.questions.map((question, index) => (
          <article key={question.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                  Вопрос {index + 1} · {QUESTION_LABELS[question.type as keyof typeof QUESTION_LABELS] ?? question.type}
                </p>
                <h4 className="mt-2 font-semibold text-[var(--ink)]">{question.prompt}</h4>
                <QuizQuestionMediaViewer
                  media={parseQuizQuestionMediaFromConfig(question.config)}
                  className="mt-4"
                />
              </div>
              <span className="rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
                До {question.points} б.
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--ink)]">
              <p className="font-medium text-[var(--ink)]">Ответ ученика</p>
              {question.fileUrl && question.fileName ? (
                <div className="mt-2 space-y-2">
                  <p>{question.fileName}</p>
                  <a
                    href={question.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  >
                    Открыть файл
                  </a>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap">{question.answerText}</p>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_0.8fr]">
              <div>
                <Label className="block">Решение</Label>
                <Select
                  name={`reviewAccepted_${question.id}`}
                  defaultValue={question.accepted === true ? "accepted" : "rejected"}
                  className="mt-1"
                >
                  <option value="accepted">Зачтено</option>
                  <option value="rejected">Не зачтено</option>
                </Select>
              </div>
              <div>
                <Label className="block">Баллы</Label>
                <Input
                  name={`reviewPoints_${question.id}`}
                  type="number"
                  min={0}
                  max={question.points}
                  step={1}
                  required
                  defaultValue={question.awardedPoints ?? question.points}
                  className="mt-1"
                />
              </div>
            </div>
          </article>
        ))}

        <div>
          <Label className="block">Комментарий ученику</Label>
          <Textarea
            name="reviewComment"
            rows={4}
            defaultValue={attempt.reviewComment}
            placeholder="Например: сильная аргументация, но в файле не хватает итоговых выводов."
            className="mt-1"
          />
          <p className="mt-2 text-xs text-[var(--ink-muted)]">
            Этот комментарий попадет в письмо ученику и будет виден ему на странице результата.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--ink-muted)]">
            После сохранения итог попытки пересчитается, а ученику уйдет email-уведомление.
          </p>
          <Button type="submit">
            {attempt.status === "pending" ? "Сохранить проверку" : "Обновить оценку"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-2 max-w-4xl text-sm text-[var(--ink-muted)]">{description}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = "zinc",
}: {
  label: string;
  value: string;
  accent?: "zinc" | "amber" | "emerald";
}) {
  const classes =
    accent === "amber"
      ? "bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning-soft)]"
      : accent === "emerald"
        ? "bg-[var(--success-soft)] text-[var(--success)] border-[var(--success-soft)]"
        : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)]";

  return (
    <div className={`rounded-xl border p-5 ${classes}`}>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-sm">{label}</div>
    </div>
  );
}

function ReviewStatusBadge({ status }: { status: "pending" | "reviewed" }) {
  const label = status === "pending" ? "На проверке" : "Проверено";

  return <Badge tone={status === "pending" ? "warning" : "success"}>{label}</Badge>;
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-2 text-sm ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent-strong)]"
          : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      {label}
    </Link>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">{label}</div>
      <div className="mt-2 font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}

function EmptyState({ statusFilter }: { statusFilter: CourseManualReviewStatusFilter }) {
  const message =
    statusFilter === "pending"
      ? "Сейчас в курсе нет работ, которые ждут проверки."
      : statusFilter === "reviewed"
        ? "Пока нет работ, которые уже были проверены."
        : "По этому курсу пока не поступало заданий с ручной проверкой.";

  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink)]">
      {message}
    </div>
  );
}

function buildReviewsHref(
  courseId: string,
  params: {
    status: CourseManualReviewStatusFilter;
    attempt?: string | null;
  }
) {
  const search = new URLSearchParams({ section: "reviews" });
  if (params.status !== "all") {
    search.set("reviewStatus", params.status);
  }
  if (params.attempt) {
    search.set("attempt", params.attempt);
  }
  return `/courses/${courseId}/manage?${search.toString()}`;
}
