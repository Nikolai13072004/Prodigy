import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizPreviewStepper } from "@/components/QuizPreviewStepper";
import { requireAdmin, requireManageCourse } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string; quizId: string }>;
};

export default async function QuizBuilderPreviewPage({ params }: Props) {
  const { id: courseId, quizId } = await params;
  await requireAdmin();
  await requireManageCourse(courseId);

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      courseItem: {
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
      questions: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!quiz || quiz.courseItem.courseId !== courseId) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/courses/${courseId}/quiz/${quizId}/builder`}
            className="text-sm text-zinc-600 underline"
          >
            ← Назад в конструктор
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">{quiz.courseItem.title}</h1>
          <p className="mt-1 text-sm text-zinc-700">
            Предпросмотр теста в режиме сотрудника. Попытка не создается.
          </p>
        </div>
      </div>

      {quiz.description && (
        <section className="mt-5 rounded-xl border border-black bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-500">Описание</h2>
          <p className="mt-2 text-sm text-zinc-700">{quiz.description}</p>
        </section>
      )}

      {quiz.questions.length === 0 ? (
        <p className="mt-5 rounded-xl border border-black bg-white p-5 text-sm text-zinc-700">
          В тесте пока нет вопросов.
        </p>
      ) : (
        <QuizPreviewStepper
          questions={quiz.questions.map((question) => ({
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            config: question.config,
            points: question.points,
          }))}
        />
      )}
    </main>
  );
}
