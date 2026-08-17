import Link from "next/link";
import { requirePermission } from "@/lib/auth-guards";
import { getAnswersAnalysisData } from "@/lib/answers-analysis-report";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

const REPORT_PATH = "/admin/reports/answers-analysis";
const EXPORT_PATH = "/admin/reports/answers-analysis/export";

type Props = {
  searchParams: Promise<{
    courseId?: string;
  }>;
};

export default async function AnswersAnalysisPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const sp = await searchParams;
  const courseId = (sp.courseId ?? "").trim();

  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  const selectedCourseId = courseId || courses[0]?.id || "";
  const data = selectedCourseId ? await getAnswersAnalysisData({ courseId: selectedCourseId }) : null;

  return (
    <main className="mx-auto max-w-[1160px] text-[#203451]">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/admin/reports"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d6deea] bg-white text-[#61738e] transition hover:bg-[#f7fbfe]"
        >
          ←
          <span className="sr-only">К разделу «Отчеты»</span>
        </Link>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#203451] sm:text-[38px]">Анализ ответов</h1>
          <p className="mt-1.5 text-sm text-[#6d7f99]">
            Все попытки по тестам внутри выбранного курса: динамика, корректность ответов и удобный экспорт в Excel.
          </p>
        </div>
      </div>

      <form action={REPORT_PATH} className="mt-6 rounded-3xl border border-[#dce3ec] bg-white p-5 shadow-[0_16px_32px_rgba(18,40,70,0.08)]">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">Курс</span>
            <select
              name="courseId"
              defaultValue={selectedCourseId}
              className="h-11 w-full rounded-2xl border border-[#d6deea] bg-white px-4 text-sm text-[#203451] outline-none ring-[#78c6e2] focus:ring-2"
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#0f7c9f] px-4 text-sm font-medium text-white transition hover:bg-[#0c6986]"
          >
            Построить отчет
          </button>

          <Link
            href={selectedCourseId ? `${EXPORT_PATH}?courseId=${encodeURIComponent(selectedCourseId)}&format=xlsx` : EXPORT_PATH}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#d6deea] bg-white px-4 text-sm font-medium text-[#203451] transition hover:bg-[#f7fbfe]"
          >
            Экспорт XLSX
          </Link>
        </div>

        <p className="mt-3 text-xs text-[#7386a3]">
          Отчет строится по выбранному курсу. Ссылка с текущим фильтром может использоваться как шаблон отчета.
        </p>
      </form>

      {!selectedCourseId || !data ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#d6deea] bg-white px-5 py-10 text-center text-sm text-[#6d7f99]">
          Выберите опубликованный курс, чтобы построить отчет «Анализ ответов».
        </div>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Средний балл" value={`${data.summary.averageScorePercent}%`} />
            <MetricCard label="Проходной балл" value={`${data.summary.passingScorePercent}%`} />
            <MetricCard label="Всего попыток" value={String(data.summary.attemptsTotal)} />
            <MetricCard label="Уникальные прохождения" value={String(data.summary.uniqueLearners)} />
            <MetricCard label="Пройдено" value={String(data.summary.passedAttempts)} />
            <MetricCard label="Не пройдено" value={String(data.summary.failedAttempts)} />
          </section>

          <section className="mt-6 rounded-3xl border border-[#dce3ec] bg-white p-5 shadow-[0_16px_32px_rgba(18,40,70,0.08)]">
            <h2 className="text-lg font-semibold text-[#203451]">Попытки прохождения</h2>
            {data.attempts.length === 0 ? (
              <p className="mt-4 text-sm text-[#6d7f99]">По выбранному курсу пока нет попыток.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e1e8f0]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f6f9fc] text-[#6d7f99]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Дата</th>
                      <th className="px-4 py-3 text-left font-medium">Сотрудник</th>
                      <th className="px-4 py-3 text-left font-medium">Материал</th>
                      <th className="px-4 py-3 text-left font-medium">Попытка</th>
                      <th className="px-4 py-3 text-left font-medium">Балл</th>
                      <th className="px-4 py-3 text-left font-medium">Результат</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attempts.map((attempt) => (
                      <tr key={attempt.attemptId} className="border-t border-[#e8eef5] text-[#203451]">
                        <td className="px-4 py-3">{formatDateTime(attempt.completedAt)}</td>
                        <td className="px-4 py-3">{attempt.learnerName} ({attempt.learnerLogin})</td>
                        <td className="px-4 py-3">{attempt.quizTitle}</td>
                        <td className="px-4 py-3">{attempt.attemptNumber}</td>
                        <td className="px-4 py-3">{attempt.score}/{attempt.maxScore} ({attempt.scorePercent}%)</td>
                        <td className="px-4 py-3">
                          <span className={attempt.outcome === "PASSED" ? "text-emerald-700" : "text-rose-700"}>
                            {attempt.outcome === "PASSED" ? "Пройден" : "Не пройден"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-3xl border border-[#dce3ec] bg-white p-5 shadow-[0_16px_32px_rgba(18,40,70,0.08)]">
            <h2 className="text-lg font-semibold text-[#203451]">Детали ответов</h2>
            {data.questionRows.length === 0 ? (
              <p className="mt-4 text-sm text-[#6d7f99]">Ответы по вопросам пока отсутствуют.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {data.questionRows.map((question) => (
                  <article key={`${question.quizId}:${question.questionId}`} className="rounded-2xl border border-[#e1e8f0] p-4">
                    <div className="text-xs text-[#7386a3]">{question.quizTitle} · {question.questionType}</div>
                    <h3 className="mt-1 text-sm font-semibold text-[#203451]">
                      {question.questionOrder + 1}. {question.prompt}
                      {question.hasImage ? " [есть изображение]" : ""}
                    </h3>

                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-[#6d7f99]">
                          <tr>
                            <th className="px-2 py-2 text-left font-medium">Ответ</th>
                            <th className="px-2 py-2 text-left font-medium">Процент</th>
                            <th className="px-2 py-2 text-left font-medium">Кол-во</th>
                            <th className="px-2 py-2 text-left font-medium">Верно/Неверно/Ручн.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {question.answers.map((answer) => (
                            <tr key={answer.value} className="border-t border-[#edf2f7]">
                              <td className="px-2 py-2 text-[#203451]">{answer.value}</td>
                              <td className="px-2 py-2 text-[#203451]">{answer.percent}%</td>
                              <td className="px-2 py-2 text-[#203451]">{answer.count}</td>
                              <td className="px-2 py-2 text-[#203451]">{answer.correctCount}/{answer.incorrectCount}/{answer.unknownCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dce3ec] bg-white p-4 shadow-[0_8px_20px_rgba(18,40,70,0.06)]">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7386a3]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[#203451]">{value}</div>
    </div>
  );
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
