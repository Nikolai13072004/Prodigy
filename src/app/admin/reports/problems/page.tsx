import Link from "next/link";
import { Children, type ReactNode } from "react";
import { requirePermission } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/roles";

export default async function ProblemReportPage() {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const now = new Date();

  const [manualReviews, failedResults, expiredDirectAssignments, expiredGroupAssignments, failedEmails] =
    await Promise.all([
      prisma.quizAttempt.findMany({
        where: { outcome: "PENDING_REVIEW" },
        orderBy: { completedAt: "desc" },
        take: 20,
        include: {
          user: { select: { name: true, login: true } },
          quiz: {
            select: {
              courseItem: {
                select: {
                  title: true,
                  courseId: true,
                  course: { select: { title: true } },
                },
              },
            },
          },
        },
      }),
      prisma.quizUserBestResult.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          user: { select: { name: true, login: true } },
          quiz: {
            select: {
              courseItem: {
                select: {
                  title: true,
                  courseId: true,
                  course: { select: { title: true } },
                },
              },
            },
          },
        },
      }),
      prisma.courseUserAssignment.findMany({
        where: { expiresAt: { lte: now }, course: { status: "PUBLISHED" } },
        orderBy: { expiresAt: "desc" },
        take: 20,
        include: {
          user: { select: { name: true, login: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      prisma.courseGroupAssignment.findMany({
        where: { expiresAt: { lte: now }, course: { status: "PUBLISHED" } },
        orderBy: { expiresAt: "desc" },
        take: 20,
        include: {
          group: { select: { name: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      prisma.emailJob.findMany({
        where: { status: "FAILED" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          toEmail: true,
          subject: true,
          lastError: true,
          updatedAt: true,
        },
      }),
    ]);

  return (
    <main className="mx-auto max-w-6xl">
      <Link href="/admin/reports" className="text-sm text-emerald-700 underline">
        ← К отчетам
      </Link>
      <div className="mt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Проблемный отчет</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Быстрый список мест, где обучение застряло: ручная проверка, проваленные тесты, истекший доступ и ошибки отправки.
        </p>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="На проверке" value={manualReviews.length} />
        <MetricCard label="Проваленные тесты" value={failedResults.length} />
        <MetricCard label="Истекший доступ" value={expiredDirectAssignments.length + expiredGroupAssignments.length} />
        <MetricCard label="Ошибки email" value={failedEmails.length} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ProblemSection id="manual-reviews" title="Ручная проверка" empty="Нет работ на проверке.">
          {manualReviews.map((attempt) => (
            <ProblemLink
              key={attempt.id}
              href={`/courses/${attempt.quiz.courseItem.courseId}/manage?section=reviews&attempt=${attempt.id}`}
              title={attempt.quiz.courseItem.title}
              meta={`${attempt.user.name} (${attempt.user.login}) · ${attempt.quiz.courseItem.course.title} · ${attempt.completedAt.toLocaleString("ru-RU")}`}
            />
          ))}
        </ProblemSection>

        <ProblemSection title="Проваленные тесты" empty="Нет проваленных итоговых результатов.">
          {failedResults.map((result) => (
            <ProblemLink
              key={result.id}
              href={`/courses/${result.quiz.courseItem.courseId}/learners/${result.userId}`}
              title={result.quiz.courseItem.title}
              meta={`${result.user.name} (${result.user.login}) · ${result.quiz.courseItem.course.title} · обновлено ${result.updatedAt.toLocaleString("ru-RU")}`}
            />
          ))}
        </ProblemSection>

        <ProblemSection id="deadlines" title="Истекший доступ" empty="Нет истекших назначений в выборке.">
          {expiredDirectAssignments.map((assignment) => (
            <ProblemLink
              key={assignment.id}
              href={`/courses/${assignment.course.id}/manage?section=assignments`}
              title={assignment.course.title}
              meta={`${assignment.user.name} (${assignment.user.login}) · до ${assignment.expiresAt?.toLocaleString("ru-RU")}`}
            />
          ))}
          {expiredGroupAssignments.map((assignment) => (
            <ProblemLink
              key={assignment.id}
              href={`/courses/${assignment.course.id}/manage?section=assignments`}
              title={assignment.course.title}
              meta={`Группа «${assignment.group.name}» · до ${assignment.expiresAt?.toLocaleString("ru-RU")}`}
            />
          ))}
        </ProblemSection>

        <ProblemSection title="Ошибки email" empty="Нет ошибок email.">
          {failedEmails.map((email) => (
            <ProblemLink
              key={email.id}
              href="/admin/reports/email-queue"
              title={email.subject}
              meta={`${email.toEmail} · ${email.lastError ?? "без текста ошибки"} · ${email.updatedAt.toLocaleString("ru-RU")}`}
            />
          ))}
        </ProblemSection>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold tracking-tight text-zinc-950">{value}</div>
      <div className="mt-1 text-sm text-zinc-500">{label}</div>
    </div>
  );
}

function ProblemSection({
  id,
  title,
  empty,
  children,
}: {
  id?: string;
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const itemCount = Children.count(children);

  return (
    <section id={id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      {itemCount === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 px-4 py-4 text-sm text-zinc-600">
          {empty}
        </p>
      ) : (
        <div className="mt-4 space-y-3">{children}</div>
      )}
    </section>
  );
}

function ProblemLink({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50">
      <div className="font-medium text-zinc-950">{title}</div>
      <div className="mt-1 text-sm text-zinc-500">{meta}</div>
    </Link>
  );
}
