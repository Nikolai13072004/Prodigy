import Link from "next/link";
import { Button, Card, Select, TD, TH, THead, TR, Table, buttonStyles } from "@/components/ui";
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
    <main className="mx-auto max-w-[1160px] text-[var(--ink)]">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/admin/reports"
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-muted)] transition hover:bg-[var(--surface)]"
        >
          ←
          <span className="sr-only">К разделу «Отчеты»</span>
        </Link>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-[38px]">Анализ ответов</h1>
          <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
            Все попытки по тестам внутри выбранного курса: динамика, корректность ответов и удобный экспорт в Excel.
          </p>
        </div>
      </div>

      <form action={REPORT_PATH} className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-1)]">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Курс</span>
            <Select name="courseId" defaultValue={selectedCourseId}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
          </label>

          <Button type="submit">Построить отчет</Button>

          <Link
            href={selectedCourseId ? `${EXPORT_PATH}?courseId=${encodeURIComponent(selectedCourseId)}&format=xlsx` : EXPORT_PATH}
            className={buttonStyles("secondary")}
          >
            Экспорт XLSX
          </Link>
        </div>

        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Отчет строится по выбранному курсу. Ссылка с текущим фильтром может использоваться как шаблон отчета.
        </p>
      </form>

      {!selectedCourseId || !data ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-5 py-10 text-center text-sm text-[var(--ink-muted)]">
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

          <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-1)]">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Попытки прохождения</h2>
            {data.attempts.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--ink-muted)]">По выбранному курсу пока нет попыток.</p>
            ) : (
              <div className="mt-4">
                <Table className="min-w-full">
                  <THead>
                    <TR>
                      <TH>Дата</TH>
                      <TH>Сотрудник</TH>
                      <TH>Материал</TH>
                      <TH>Попытка</TH>
                      <TH>Балл</TH>
                      <TH>Результат</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {data.attempts.map((attempt) => (
                      <TR key={attempt.attemptId}>
                        <TD>{formatDateTime(attempt.completedAt)}</TD>
                        <TD>{attempt.learnerName} ({attempt.learnerLogin})</TD>
                        <TD>{attempt.quizTitle}</TD>
                        <TD>{attempt.attemptNumber}</TD>
                        <TD>{attempt.score}/{attempt.maxScore} ({attempt.scorePercent}%)</TD>
                        <TD>
                          <span className={attempt.outcome === "PASSED" ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                            {attempt.outcome === "PASSED" ? "Пройден" : "Не пройден"}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-1)]">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Детали ответов</h2>
            {data.questionRows.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--ink-muted)]">Ответы по вопросам пока отсутствуют.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {data.questionRows.map((question) => (
                  <article key={`${question.quizId}:${question.questionId}`} className="rounded-2xl border border-[var(--line)] p-4">
                    <div className="text-xs text-[var(--ink-muted)]">{question.quizTitle} · {question.questionType}</div>
                    <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {question.questionOrder + 1}. {question.prompt}
                      {question.hasImage ? " [есть изображение]" : ""}
                    </h3>

                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-[var(--ink-muted)]">
                          <tr>
                            <th className="px-2 py-2 text-left font-medium">Ответ</th>
                            <th className="px-2 py-2 text-left font-medium">Процент</th>
                            <th className="px-2 py-2 text-left font-medium">Кол-во</th>
                            <th className="px-2 py-2 text-left font-medium">Верно/Неверно/Ручн.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {question.answers.map((answer) => (
                            <tr key={answer.value} className="border-t border-[var(--line)]">
                              <td className="px-2 py-2 text-[var(--ink)]">{answer.value}</td>
                              <td className="px-2 py-2 text-[var(--ink)]">{answer.percent}%</td>
                              <td className="px-2 py-2 text-[var(--ink)]">{answer.count}</td>
                              <td className="px-2 py-2 text-[var(--ink)]">{answer.correctCount}/{answer.incorrectCount}/{answer.unknownCount}</td>
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
    <Card padding="sm">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</div>
    </Card>
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
