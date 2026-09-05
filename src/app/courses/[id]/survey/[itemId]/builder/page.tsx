import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import {
  applyReusableCourseItemSurveyTemplate,
  saveCourseItemSurveyTemplate,
} from "@/app/actions/course-survey-actions";
import { CourseCoverInput } from "@/components/CourseCoverInput";
import { CourseSurveyBuilder } from "@/components/CourseSurveyBuilder";
import { CourseSurveyPreviewDialog } from "@/components/CourseSurveyPreviewDialog";
import { CourseSurveySaveActions } from "@/components/CourseSurveySaveActions";
import { DetailsCloseButton } from "@/components/DetailsCloseButton";
import { requireCourseWorkspaceAccess } from "@/lib/auth-guards";
import {
  DEFAULT_COURSE_SURVEY_TITLE,
  formatCourseSurveyTitle,
  getDefaultCourseSurveyQuestions,
  parseCourseSurveyQuestionOptionsJson,
  type CourseSurveyQuestionDraft,
} from "@/lib/course-surveys";
import prisma from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<{ surveySaved?: string; surveyError?: string }>;
};

export default async function CourseItemSurveyBuilderPage({ params, searchParams }: Props) {
  const [{ id: courseId, itemId }, sp] = await Promise.all([params, searchParams]);
  const access = await requireCourseWorkspaceAccess(courseId);
  if (!access.canEditCourse) {
    redirect(`/courses/${courseId}/manage`);
  }

  const [item, reusableTemplates] = await Promise.all([
    prisma.courseItem.findFirst({
      where: { id: itemId, courseId, archivedAt: null },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
        module: {
          select: {
            title: true,
          },
        },
        surveyTemplate: {
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
            },
            responses: {
              orderBy: { createdAt: "desc" },
              take: 20,
              include: {
                user: {
                  select: {
                    name: true,
                    login: true,
                  },
                },
                answers: {
                  include: {
                    question: {
                      select: {
                        title: true,
                        type: true,
                        orderIndex: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.reusableCourseSurveyTemplate.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            title: true,
            type: true,
            optionsJson: true,
            isRequired: true,
          },
        },
      },
    }),
  ]);

  if (!item || item.type !== "SURVEY") notFound();

  const template = item.surveyTemplate;
  const title = formatCourseSurveyTitle(template?.title ?? item.title ?? DEFAULT_COURSE_SURVEY_TITLE);
  const description =
    template?.description ?? "Поделитесь впечатлением о курсе и качестве учебных материалов.";
  const questions = getInitialQuestions(template?.questions ?? []);
  const responses = template?.responses ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/courses/${courseId}/manage?section=structure`} className="text-[var(--info)] underline">
          ← К структуре курса
        </Link>
        <span className="text-[var(--ink-muted)]">·</span>
        <Link href={`/courses/${courseId}/manage`} className="text-[var(--info)] underline">
          К управлению курсом
        </Link>
      </div>

      <form action={saveCourseItemSurveyTemplate.bind(null, courseId, itemId)} className="space-y-5">
        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                {item.module?.title ? `${item.module.title} · ` : ""}Опрос
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--ink)]">{title}</h1>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Вопросы собираются в конструкторе, титульный лист и публикация открываются кнопкой параметров.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SurveySettingsPanel
                title={title}
                description={description}
                introImageUrl={template?.introImageUrl ?? null}
                isActive={template?.isActive ?? true}
                isRequired={item.isRequired}
              />
              <CourseSurveyPreviewDialog />
              <CourseSurveySaveActions />
            </div>
          </div>

          {sp.surveySaved ? (
            <div className="border-b border-[var(--success)] bg-[var(--success-soft)] px-5 py-3 text-sm text-[var(--success)]">
              {sp.surveySaved}
            </div>
          ) : null}
          {sp.surveyError ? (
            <div className="border-b border-[var(--danger)] bg-[var(--danger-soft)] px-5 py-3 text-sm text-[var(--danger)]">
              {sp.surveyError}
            </div>
          ) : null}

          <div className="p-5">
            <CourseSurveyBuilder initialQuestions={questions} />
          </div>
        </section>
      </form>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ReusableTemplatesCard
          courseId={courseId}
          itemId={itemId}
          templates={reusableTemplates.map((surveyTemplate) => ({
            id: surveyTemplate.id,
            title: formatCourseSurveyTitle(surveyTemplate.title),
            questionsCount: surveyTemplate.questions.length,
          }))}
        />
        <ResponsesCard responses={responses} />
      </section>
    </main>
  );
}

function SurveySettingsPanel({
  title,
  description,
  introImageUrl,
  isActive,
  isRequired,
}: {
  title: string;
  description: string | null;
  introImageUrl: string | null;
  isActive: boolean;
  isRequired: boolean;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Параметры опроса
      </summary>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4 py-6">
        <div className="w-full max-w-3xl rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <p className="text-base font-semibold text-[var(--ink)]">Параметры опроса</p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">Титульный лист и публикация для учеников.</p>
            </div>
            <DetailsCloseButton className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--accent-soft)]" />
          </div>

          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto">
            <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-[var(--ink)]">
                  Название опроса
                  <input
                    name="title"
                    defaultValue={title}
                    className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--ink-muted)]"
                  />
                </label>

                <label className="block text-sm font-medium text-[var(--ink)]">
                  Описание для ученика
                  <textarea
                    name="description"
                    rows={4}
                    defaultValue={description ?? ""}
                    className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--ink-muted)]"
                  />
                </label>

                <div className="border-t border-[var(--line)] pt-4">
                  <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Публикация</p>
                  <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={isActive}
                      className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    Активен для учеников
                  </label>
                  <label className="mt-3 flex items-center gap-2 text-sm text-[var(--ink)]">
                    <input
                      type="checkbox"
                      name="isRequired"
                      defaultChecked={isRequired}
                      className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    Обязательный материал
                  </label>
                </div>
              </div>

              <CourseCoverInput
                name="introImageUrl"
                initialValue={introImageUrl}
                label="Фон титульного листа"
                hint="Изображение первого экрана опроса."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-5 py-4">
            <DetailsCloseButton
              label="Закрыть параметры"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              Закрыть
            </DetailsCloseButton>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              Сохранить опрос
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

function ReusableTemplatesCard({
  courseId,
  itemId,
  templates,
}: {
  courseId: string;
  itemId: string;
  templates: Array<{ id: string; title: string; questionsCount: number }>;
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">Шаблоны опросов</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Сохраненные шаблоны можно применять к любому опросу.</p>
        </div>
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
          {templates.length} шаблонов
        </span>
      </div>

      {templates.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] px-4 py-3 text-sm text-[var(--ink-muted)]">
          Пока нет сохраненных шаблонов.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {templates.map((template) => (
            <form
              key={template.id}
              action={applyReusableCourseItemSurveyTemplate.bind(null, courseId, itemId)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-4 py-3"
            >
              <input type="hidden" name="reusableTemplateId" value={template.id} />
              <div>
                <p className="font-medium text-[var(--ink)]">{template.title}</p>
                <p className="text-xs text-[var(--ink-muted)]">{template.questionsCount} вопросов</p>
              </div>
              <button
                type="submit"
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                Применить
              </button>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}

function ResponsesCard({
  responses,
}: {
  responses: Array<{
    id: string;
    createdAt: Date;
    user: { name: string; login: string };
    answers: Array<{
      ratingValue: number | null;
      textValue: string | null;
      question: { title: string; type: string; orderIndex: number };
    }>;
  }>;
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--ink)]">Ответы</h2>
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
          {responses.length}
        </span>
      </div>
      {responses.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--ink-muted)]">Ответов пока нет.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {responses.map((response) => (
            <article key={response.id} className="rounded-xl border border-[var(--line)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-[var(--ink)]">{response.user.name || response.user.login}</p>
                <time className="text-xs text-[var(--ink-muted)]">
                  {response.createdAt.toLocaleString("ru-RU")}
                </time>
              </div>
              <div className="mt-3 space-y-2">
                {response.answers
                  .slice()
                  .sort((left, right) => left.question.orderIndex - right.question.orderIndex)
                  .slice(0, 3)
                  .map((answer, index) => (
                    <p key={`${response.id}-${index}`} className="text-sm text-[var(--ink-muted)]">
                      <span className="font-medium text-[var(--ink)]">{answer.question.title}: </span>
                      {typeof answer.ratingValue === "number" ? answer.ratingValue : answer.textValue || "Ответ не указан"}
                    </p>
                  ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function getInitialQuestions(
  questions: Array<{
    id: string;
    title: string;
    type: string;
    isRequired: boolean;
    optionsJson: string | null;
  }>
): CourseSurveyQuestionDraft[] {
  if (questions.length === 0) return getDefaultCourseSurveyQuestions();

  return questions.map((question) => ({
    id: question.id,
    title: question.title,
    type: question.type === "RATING_5" || question.type === "SINGLE_CHOICE" ? question.type : "TEXT",
    isRequired: question.isRequired,
    options: parseCourseSurveyQuestionOptionsJson(question.optionsJson),
  }));
}
