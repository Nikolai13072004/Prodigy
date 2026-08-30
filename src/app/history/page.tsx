import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ATTEMPT_OUTCOME_LABELS } from "@/lib/constants";
import prisma from "@/lib/prisma";
import { isPlatformAdminRole } from "@/lib/roles";
import { AnalyticsSubtabs } from "@/components/AnalyticsSubtabs";
import { Card } from "@/components/ui";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!isPlatformAdminRole(session.user.roles)) {
    redirect("/courses");
  }

  const courses = await prisma.course.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        orderBy: { orderIndex: "asc" },
        include: {
          quiz: {
            include: {
              attempts: {
                orderBy: { completedAt: "desc" },
                include: {
                  user: { select: { name: true, login: true } },
                },
              },
            },
          },
        },
      },
      feedbacks: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, login: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">История прохождений</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Здесь собраны попытки тестов и отзывы по курсам в разрезе каждого курса.
        </p>
      </div>

      <AnalyticsSubtabs active="history" />

      <div className="mt-8 space-y-8">
        {courses.map((course) => (
          <Card key={course.id} padding="lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{course.title}</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {course.status === "PUBLISHED" ? "Опубликован" : "Черновик"}
                </p>
              </div>
              <Link href={`/courses/${course.id}`} className="text-sm text-[var(--accent)] underline">
                Открыть курс
              </Link>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Тесты и попытки</h3>
                <div className="mt-3 space-y-3">
                  {course.items.filter((item) => item.type === "QUIZ" && item.quiz).length === 0 ? (
                    <p className="text-sm text-[var(--ink-muted)]">В курсе нет тестов.</p>
                  ) : (
                    course.items
                      .filter((item) => item.type === "QUIZ" && item.quiz)
                      .map((item) => (
                        <div key={item.id} className="rounded-lg border border-[var(--line)] p-4">
                          <div className="font-medium">{item.title}</div>
                          {item.quiz?.attempts.length ? (
                            <ul className="mt-3 space-y-2">
                              {item.quiz.attempts.map((attempt) => (
                                <li key={attempt.id} className="rounded-md border border-[var(--line)] p-3">
                                  <div className="text-xs text-[var(--ink-muted)]">
                                    {attempt.completedAt ? attempt.completedAt.toLocaleString("ru-RU") : "Попытка в работе"}
                                  </div>
                                  <div className="mt-1 text-sm text-[var(--ink)]">
                                    {attempt.user.name} ({attempt.user.login}) · попытка {attempt.attemptNumber} · {attempt.correctAnswers}/
                                    {attempt.totalQuestions} ·{" "}
                                    {ATTEMPT_OUTCOME_LABELS[attempt.outcome as keyof typeof ATTEMPT_OUTCOME_LABELS]}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-sm text-[var(--ink-muted)]">Попыток пока нет.</p>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Отзывы по курсу</h3>
                {course.feedbacks.length ? (
                  <ul className="mt-3 space-y-3 text-sm text-[var(--ink)]">
                    {course.feedbacks.map((feedback) => (
                      <li key={feedback.id} className="rounded-lg border border-[var(--line)] p-4">
                        <div className="text-xs text-[var(--ink-muted)]">{feedback.createdAt.toLocaleString("ru-RU")}</div>
                        <div className="font-medium">
                          {feedback.user.name} ({feedback.user.login})
                        </div>
                        <div className="mt-1 text-xs text-[var(--ink-muted)]">
                          Оценка: {feedback.rating}/5 · {feedback.status === "PUBLISHED" ? "Опубликован" : "На модерации"}
                        </div>
                        {feedback.comment && <p className="mt-2">{feedback.comment}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-[var(--ink-muted)]">Отзывов пока нет.</p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
