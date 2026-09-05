import { SlidersHorizontal } from "lucide-react";

import {
  applyReusableCourseSurveyTemplate,
  saveCourseSurveyTemplate,
} from "@/app/actions/course-survey-actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { CourseCoverInput } from "@/components/CourseCoverInput";
import { CourseSurveyBuilder } from "@/components/CourseSurveyBuilder";
import { CourseSurveyPreviewDialog } from "@/components/CourseSurveyPreviewDialog";
import { CourseSurveySaveActions } from "@/components/CourseSurveySaveActions";
import { DetailsCloseButton } from "@/components/DetailsCloseButton";
import { Input, Select, Textarea } from "@/components/ui";
import {
  COURSE_SURVEY_QUESTION_TYPE_LABELS,
  formatCourseSurveyTitle,
} from "@/lib/course-surveys";

import type { CourseManagementData } from "./_queries/get-course-management-data";
import type { CourseSurveyViewModel } from "./_queries/select-course-survey";

type Props = {
  course: NonNullable<CourseManagementData["course"]>;
  reusableSurveyTemplates: CourseManagementData["reusableSurveyTemplates"];
  viewModel: CourseSurveyViewModel;
  messages: { surveySaved?: string; surveyError?: string };
};

export function CourseSurveySection({
  course,
  reusableSurveyTemplates,
  viewModel,
  messages: sp,
}: Props) {
  const surveyTemplate = course.surveyTemplate;
  const surveyQuestionDrafts = viewModel.questionDrafts;
  const surveyResponses = surveyTemplate?.responses ?? [];
  const surveyAverageByQuestionId = new Map(
    viewModel.ratingQuestions.map((question) => [question.id, question.average])
  );

  return (
    <div className="space-y-6">
      {sp.surveySaved ? (
        <p className="rounded-xl border border-[var(--success-soft)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]">
          {sp.surveySaved}
        </p>
      ) : null}
      {sp.surveyError ? (
        <p className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {sp.surveyError}
        </p>
      ) : null}

      <form action={saveCourseSurveyTemplate.bind(null, course.id)} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Конструктор опроса</h3>
            <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
              Соберите вопросы. Титульный лист и публикация открываются отдельной кнопкой.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <details className="relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)] [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="h-4 w-4" />
                Параметры опроса
              </summary>
              <div className="fixed left-1/2 top-1/2 z-30 max-h-[calc(100dvh-120px)] w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">Параметры опроса</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Титульный лист и публикация для ученика.</p>
                  </div>
                  <DetailsCloseButton
                    label="Закрыть параметры опроса"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                  />
                </div>
                <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-4">
                    <label className="grid gap-2 text-sm text-[var(--ink)]">
                      <span>Название опроса</span>
                      <Input
                        name="title"
                        defaultValue={formatCourseSurveyTitle(surveyTemplate?.title)}
                      />
                    </label>

                    <label className="grid gap-2 text-sm text-[var(--ink)]">
                      <span>Описание для ученика</span>
                      <Textarea
                        name="description"
                        rows={4}
                        defaultValue={surveyTemplate?.description ?? "Поделитесь впечатлением о курсе и качестве учебных материалов."}
                      />
                    </label>

                    <div className="grid gap-3 border-t border-[var(--line)] pt-4">
                      <p className="text-sm font-semibold text-[var(--ink)]">Публикация</p>
                      <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={surveyTemplate?.isActive ?? true}
                          className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                        />
                        <span>Активен для учеников</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                        <input
                          type="checkbox"
                          name="isRequired"
                          defaultChecked={surveyTemplate?.isRequired ?? false}
                          className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                        />
                        <span>Помечать как обязательный</span>
                      </label>
                      <p className="text-xs text-[var(--ink-muted)]">
                        Обязательный опрос не блокирует завершение курса, но выделяется как ожидающий ответа.
                      </p>
                    </div>
                  </div>

                  <CourseCoverInput
                    initialValue={surveyTemplate?.introImageUrl ?? null}
                    name="introImageUrl"
                    label="Фон титульного листа"
                    hint="Изображение первого экрана опроса."
                    assetKind="cover"
                    previewAspectRatio="16 / 9"
                    previewClassName="w-full max-w-full"
                    variant="plain"
                  />
                </div>
              </div>
            </details>

            <CourseSurveyPreviewDialog />

            <CourseSurveySaveActions />
          </div>
        </div>

        <div className="p-4">
          <CourseSurveyBuilder initialQuestions={surveyQuestionDrafts} />
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
        <details>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
            <span>
              <span className="block text-base font-semibold text-[var(--ink)]">Шаблоны опросов</span>
              <span className="mt-1 block text-sm text-[var(--ink-muted)]">
                Применение сохраненного шаблона к этому курсу.
              </span>
            </span>
            <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
              {reusableSurveyTemplates.length} шаблонов
            </span>
          </summary>

          {reusableSurveyTemplates.length > 0 ? (
            <form
              action={applyReusableCourseSurveyTemplate.bind(null, course.id)}
              className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
            >
              <label className="grid gap-2 text-sm text-[var(--ink)]">
                <span>Выбрать шаблон</span>
                <Select name="reusableTemplateId">
                  {reusableSurveyTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {formatCourseSurveyTitle(template.title)} · {template.questions.length} вопросов
                    </option>
                  ))}
                </Select>
              </label>

              <div className="flex items-end">
                <ConfirmSubmitButton
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  confirmMessage="Применить выбранный шаблон? Текущие настройки и вопросы опроса курса будут заменены."
                >
                  Применить шаблон
                </ConfirmSubmitButton>
              </div>
            </form>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--ink-muted)]">
              Пока нет сохраненных шаблонов. Настройте опрос выше и нажмите «Сохранить как шаблон».
            </p>
          )}
        </details>
      </section>

      {surveyTemplate ? (
        <>
          <section className="grid gap-4 lg:grid-cols-4">
            <MetricCard
              label="Статус"
              value={surveyTemplate.isActive ? "Активен" : "Черновик"}
              description={surveyTemplate.isActive ? "Ученики видят опрос после завершения курса." : "Опрос скрыт для учеников."}
            />
            <MetricCard
              label="Вопросы"
              value={String(surveyTemplate.questions.length)}
              description={`${surveyTemplate.questions.filter((question) => question.isRequired).length} обязательных`}
            />
            <MetricCard
              label="Ответы"
              value={String(surveyResponses.length)}
              description="Сохраненные ответы по этому опросу"
            />
            <MetricCard
              label="Режим"
              value={surveyTemplate.isRequired ? "Обязательный" : "Необязательный"}
              description="Без блокировки завершения курса"
            />
          </section>

          {surveyTemplate.questions.filter((question) => question.type === "RATING_5").length > 0 ? (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              <h3 className="text-base font-semibold text-[var(--ink)]">Средние оценки по шкальным вопросам</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {surveyTemplate.questions
                  .filter((question) => question.type === "RATING_5")
                  .map((question) => (
                    <div key={question.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
                      <p className="text-sm font-medium text-[var(--ink)]">{question.title}</p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div className="text-3xl font-semibold text-[var(--ink)]">
                          {surveyAverageByQuestionId.get(question.id) ?? "—"}
                        </div>
                        <div className="text-xs text-[var(--ink-muted)]">
                          {COURSE_SURVEY_QUESTION_TYPE_LABELS.RATING_5}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--ink)]">Ответы учеников</h3>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Последние сохраненные ответы по этому опросу.
                </p>
              </div>
              <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
                {surveyResponses.length} ответов
              </span>
            </div>

            {surveyResponses.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--ink-muted)]">
                Ученики еще не проходили опрос по этому курсу.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {surveyResponses.map((response) => (
                  <article key={response.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ink-muted)]">
                      <span className="font-medium text-[var(--ink)]">{response.user.name}</span>
                      <span>·</span>
                      <span>{response.user.login}</span>
                      <span>·</span>
                      <span>{response.user.department?.name ?? "Без подразделения"}</span>
                      <span>·</span>
                      <span>{response.createdAt.toLocaleString("ru-RU")}</span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {[...response.answers]
                        .sort((left, right) => left.question.orderIndex - right.question.orderIndex)
                        .map((answer) => (
                        <div key={answer.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-medium text-[var(--ink)]">{answer.question.title}</p>
                            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
                              {answer.question.type === "RATING_5"
                                ? COURSE_SURVEY_QUESTION_TYPE_LABELS.RATING_5
                                : answer.question.type === "SINGLE_CHOICE"
                                  ? COURSE_SURVEY_QUESTION_TYPE_LABELS.SINGLE_CHOICE
                                  : COURSE_SURVEY_QUESTION_TYPE_LABELS.TEXT}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-[var(--ink)]">
                            {typeof answer.ratingValue === "number" ? (
                              <span className="font-semibold text-[var(--ink)]">{answer.ratingValue}/5</span>
                            ) : answer.textValue?.trim() ? (
                              <p className="whitespace-pre-line">{answer.textValue}</p>
                            ) : (
                              <span className="text-[var(--ink-muted)]">Ответ не указан</span>
                            )}
                          </div>
                        </div>
                        ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">{description}</p>
    </div>
  );
}
