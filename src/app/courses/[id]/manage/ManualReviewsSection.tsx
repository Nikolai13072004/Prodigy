import Link from "next/link";
import { reviewQuizAttempt } from "@/app/actions/course-assessment-actions";
import { QuizQuestionMediaViewer } from "@/components/QuizQuestionMediaViewer";
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
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-zinc-500">{row.quizTitle}</p>
                      <h3 className="mt-1 font-semibold text-zinc-950">{row.learnerName}</h3>
                      <p className="mt-1 text-sm text-zinc-600">
                        {row.learnerLogin} · попытка {row.attemptNumber}
                      </p>
                    </div>
                    <ReviewStatusBadge status={row.status} />
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Сдано</dt>
                      <dd className="mt-1 text-zinc-700">{row.submittedAt.toLocaleString("ru-RU")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Ручных вопросов</dt>
                      <dd className="mt-1 text-zinc-700">{row.manualQuestionsCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Проверено</dt>
                      <dd className="mt-1 text-zinc-700">
                        {row.reviewedAt ? row.reviewedAt.toLocaleString("ru-RU") : "Еще нет"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Комментарий</dt>
                      <dd className="mt-1 text-zinc-700">{row.reviewCommentPreview ?? "Без комментария"}</dd>
                    </div>
                  </dl>
                </Link>
              );
            })}
          </aside>

          <section
            aria-label="Детали проверки работы"
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            {data.selectedAttempt ? (
              <ReviewDetail
                courseId={courseId}
                statusFilter={statusFilter}
                attempt={data.selectedAttempt}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center text-sm text-zinc-700">
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
          <p className="text-xs uppercase tracking-wide text-zinc-500">{attempt.quizTitle}</p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-950">{attempt.learnerName}</h3>
          <p className="mt-2 text-sm text-zinc-600">
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

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-sm text-zinc-700">
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
          <article key={question.id} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Вопрос {index + 1} · {QUESTION_LABELS[question.type as keyof typeof QUESTION_LABELS] ?? question.type}
                </p>
                <h4 className="mt-2 font-semibold text-zinc-950">{question.prompt}</h4>
                <QuizQuestionMediaViewer
                  media={parseQuizQuestionMediaFromConfig(question.config)}
                  className="mt-4"
                />
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                До {question.points} б.
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
              <p className="font-medium text-zinc-950">Ответ ученика</p>
              {question.fileUrl && question.fileName ? (
                <div className="mt-2 space-y-2">
                  <p>{question.fileName}</p>
                  <a
                    href={question.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
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
                <label className="block text-sm font-medium text-zinc-800">Решение</label>
                <select
                  name={`reviewAccepted_${question.id}`}
                  defaultValue={question.accepted === true ? "accepted" : "rejected"}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                >
                  <option value="accepted">Зачтено</option>
                  <option value="rejected">Не зачтено</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-800">Баллы</label>
                <input
                  name={`reviewPoints_${question.id}`}
                  type="number"
                  min={0}
                  max={question.points}
                  step={1}
                  required
                  defaultValue={question.awardedPoints ?? question.points}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                />
              </div>
            </div>
          </article>
        ))}

        <div>
          <label className="block text-sm font-medium text-zinc-800">Комментарий ученику</label>
          <textarea
            name="reviewComment"
            rows={4}
            defaultValue={attempt.reviewComment}
            placeholder="Например: сильная аргументация, но в файле не хватает итоговых выводов."
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <p className="mt-2 text-xs text-zinc-500">
            Этот комментарий попадет в письмо ученику и будет виден ему на странице результата.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            После сохранения итог попытки пересчитается, а ученику уйдет email-уведомление.
          </p>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {attempt.status === "pending" ? "Сохранить проверку" : "Обновить оценку"}
          </button>
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
      <h2 className="text-xl font-semibold text-zinc-950">{title}</h2>
      <p className="mt-2 max-w-4xl text-sm text-zinc-600">{description}</p>
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
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : accent === "emerald"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-zinc-50 text-zinc-700 border-zinc-200";

  return (
    <div className={`rounded-xl border p-5 ${classes}`}>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-sm">{label}</div>
    </div>
  );
}

function ReviewStatusBadge({ status }: { status: "pending" | "reviewed" }) {
  const classes =
    status === "pending"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";
  const label = status === "pending" ? "На проверке" : "Проверено";

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${classes}`}>{label}</span>;
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
          ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-700"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {label}
    </Link>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 font-semibold text-zinc-950">{value}</div>
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
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center text-sm text-zinc-700">
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
