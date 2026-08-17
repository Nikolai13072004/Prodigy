import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, FileText, Plus, Settings, Trash2, Upload } from "lucide-react";
import {
  addQuizBuilderQuestion,
  importQuizBuilderQuestionsFromDocx,
  deleteQuizBuilderQuestion,
  deleteQuizFromBuilder,
  moveQuizBuilderQuestion,
  saveQuizBuilderSettings,
  updateQuizBuilderQuestion,
} from "@/app/actions/quiz-builder-actions";
import { CourseModalAutoClose } from "@/app/courses/[id]/manage/CourseModalAutoClose";
import { BuilderActionToast } from "@/components/quiz-builder/BuilderActionToast";
import {
  CreateQuestionForm,
  EditQuestionForm,
  type QuizQuestionType,
} from "@/components/quiz-builder/QuizQuestionForm";
import { QUESTION_LABELS, RESULT_VIEW_MODE_LABELS } from "@/lib/constants";
import { requireAdmin, requireManageCourse } from "@/lib/auth-guards";
import prisma from "@/lib/prisma";
import {
  normalizeQuizQuestionMedia,
  parseQuizQuestionMediaFromConfig,
} from "@/lib/quiz-question-media";

type BuilderSearchParams = {
  createType?: string;
  edit?: string;
  confirmDelete?: string;
  error?: string;
  saved?: string;
  settings?: string;
};

type Props = {
  params: Promise<{ id: string; quizId: string }>;
  searchParams: Promise<BuilderSearchParams>;
};

type QuestionInitialValues = {
  single: {
    options: string[];
    correctIndex: number;
  };
  open: {
    sampleAnswer: string;
    reviewMode: "AUTO" | "MANUAL";
  };
  matching: {
    left: string[];
    right: string[];
    correctPairs: number[];
  };
  file: {
    allowedExtensions: string[];
    maxFileSizeMb: number;
  };
};

export default async function QuizBuilderPage({ params, searchParams }: Props) {
  const { id: courseId, quizId } = await params;
  const sp = await searchParams;

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
              status: true,
              resultViewMode: true,
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

  const createType = normalizeQuestionType(sp.createType) ?? "SINGLE_CHOICE";
  const selectedQuestion =
    !sp.createType && quiz.questions.length > 0
      ? quiz.questions.find((question) => question.id === sp.edit) ?? quiz.questions[0]
      : null;
  const selectedQuestionType = selectedQuestion ? normalizeQuestionType(selectedQuestion.type) : null;
  const selectedQuestionInitialValues = selectedQuestion
    ? getQuestionInitialValues(selectedQuestionType, selectedQuestion.config)
    : null;
  const selectedQuestionIndex = selectedQuestion
    ? quiz.questions.findIndex((question) => question.id === selectedQuestion.id)
    : -1;
  const isCreatingQuestion = Boolean(sp.createType) || quiz.questions.length === 0;
  const currentViewParams =
    isCreatingQuestion && sp.createType
      ? { createType }
      : selectedQuestion
        ? { edit: selectedQuestion.id }
        : {};

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {(sp.saved || sp.error) && (
        <div className="fixed right-4 top-20 z-50 flex w-full max-w-sm flex-col gap-2">
          {sp.saved ? <BuilderActionToast kind="success" message={sp.saved} /> : null}
          {sp.error ? <BuilderActionToast kind="error" message={sp.error} /> : null}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/courses/${courseId}/manage`}
            className="text-sm text-zinc-600 underline dark:text-zinc-400"
          >
            ← Назад к управлению курсом
          </Link>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Курс: {quiz.courseItem.course.title} · статус:{" "}
            {quiz.courseItem.course.status === "PUBLISHED" ? "опубликован" : "черновик"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildBaseQuery({ ...currentViewParams, settings: "1" })}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Настройки
          </Link>
          <Link
            href={`/courses/${courseId}/quiz/${quizId}/builder/preview`}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Предпросмотр
          </Link>
          <form action={deleteQuizFromBuilder.bind(null, courseId, quizId)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Удалить тест
            </button>
          </form>
        </div>
      </div>

      {sp.settings === "1" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-zinc-950/40 p-4">
          <CourseModalAutoClose href={buildBaseQuery(currentViewParams)} />
          <Link
            href={buildBaseQuery(currentViewParams)}
            aria-label="Закрыть настройки теста"
            className="absolute inset-0"
          />
          <div className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="shrink-0 border-b border-zinc-200 p-6 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Настройки</p>
                <h2 className="text-xl font-semibold">Параметры теста</h2>
              </div>
              <Link
                href={buildBaseQuery(currentViewParams)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Закрыть
              </Link>
              </div>
            </div>

            <form
              action={saveQuizBuilderSettings.bind(null, courseId, quizId)}
              className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-6 md:grid-cols-2"
            >
              <div className="md:col-span-2">
                <label className="block text-sm font-medium">Название теста</label>
                <input
                  name="title"
                  required
                  defaultValue={quiz.courseItem.title}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium">Описание теста</label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={quiz.description ?? ""}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Максимум попыток</label>
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  required
                  defaultValue={quiz.maxAttempts}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Мин. правильных для сдачи</label>
                <input
                  name="minCorrectAnswers"
                  type="number"
                  min={1}
                  required
                  defaultValue={quiz.minCorrectAnswers}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium">Лимит времени, минуты</label>
                <input
                  name="timeLimitMinutes"
                  type="number"
                  min={1}
                  defaultValue={quiz.timeLimitMinutes ?? ""}
                  placeholder="Без ограничения"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Вопросов в попытке</label>
                <input
                  name="questionPoolSize"
                  type="number"
                  min={1}
                  defaultValue={quiz.questionPoolSize ?? ""}
                  placeholder={`Все ${quiz.questions.length}`}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Если указать меньше общего числа, каждая попытка получит случайный набор вопросов.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium">Пауза между попытками, минуты</label>
                <input
                  name="retryDelayMinutes"
                  type="number"
                  min={1}
                  defaultValue={quiz.retryDelayMinutes ?? ""}
                  placeholder="Без паузы"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm md:col-span-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="shuffleQuestions"
                    value="1"
                    defaultChecked={quiz.shuffleQuestions}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Перемешивать вопросы для каждой попытки</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="shuffleAnswers"
                    value="1"
                    defaultChecked={quiz.shuffleAnswers}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Перемешивать варианты ответов в вопросах с выбором</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="lockMaterialsOnStart"
                    value="1"
                    defaultChecked={quiz.lockMaterialsOnStart}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  <span>После старта теста возвращать ученика в тест вместо материалов курса</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="trackSecurityEvents"
                    value="1"
                    defaultChecked={quiz.trackSecurityEvents}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Фиксировать уход со страницы и потерю фокуса во время теста</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium">Режим показа результата</label>
                <select
                  name="resultViewMode"
                  defaultValue={quiz.courseItem.course.resultViewMode}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {Object.entries(RESULT_VIEW_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Настройка общая для курса: можно показать только итог, итог с ответами ученика или полный разбор.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Сохранить настройки
                </button>
                <Link
                  href={buildBaseQuery(currentViewParams)}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Отмена
                </Link>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="grid min-h-[640px] lg:grid-cols-[270px_1fr]">
          <aside className="border-b border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/30 lg:border-b-0 lg:border-r">
            <Link
              href={buildBaseQuery({ createType: "SINGLE_CHOICE" })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Новый вопрос
            </Link>

            <form
              action={importQuizBuilderQuestionsFromDocx.bind(null, courseId, quizId)}
              encType="multipart/form-data"
              className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/60"
            >
              <label htmlFor="quiz-docx-import" className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Импорт DOCX
              </label>
              <input
                id="quiz-docx-import"
                name="docxFile"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                className="mt-2 block w-full text-xs text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-800 hover:file:bg-zinc-200 dark:text-zinc-300 dark:file:bg-zinc-800 dark:file:text-zinc-100 dark:hover:file:bg-zinc-700"
              />
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Вопрос, варианты ответа, правильный вариант жирным.
              </p>
              <button
                type="submit"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Создать вопросы
              </button>
            </form>

            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Содержание</p>
              <div className="mt-3 space-y-1">
                {quiz.questions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                    Вопросов пока нет.
                  </div>
                ) : (
                  quiz.questions.map((question, index) => {
                    const questionType = normalizeQuestionType(question.type);
                    const isActive = selectedQuestion?.id === question.id && !isCreatingQuestion;
                    return (
                      <Link
                        key={question.id}
                        href={buildBaseQuery({ edit: question.id })}
                        className={`flex gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition ${
                          isActive
                            ? "border-l-zinc-900 bg-white text-zinc-950 shadow-sm dark:border-l-zinc-100 dark:bg-zinc-900 dark:text-zinc-50"
                            : "border-l-transparent text-zinc-600 hover:bg-white hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                        }`}
                      >
                        <span className="w-5 shrink-0 text-right font-semibold">{index + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{question.prompt || "Без текста вопроса"}</span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">
                            {QUESTION_LABELS[(questionType ?? question.type) as keyof typeof QUESTION_LABELS] ??
                              question.type}
                          </span>
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          <div className="min-w-0 p-6">
            {isCreatingQuestion ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Новый вопрос</p>
                    <h2 className="mt-1 text-xl font-semibold">Добавить вопрос</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <QuestionTypeLink label="Один вариант" value="SINGLE_CHOICE" activeType={createType} />
                    <QuestionTypeLink label="Открытый" value="OPEN" activeType={createType} />
                    <QuestionTypeLink label="Соответствие" value="MATCHING" activeType={createType} />
                    <QuestionTypeLink label="Файл" value="FILE" activeType={createType} />
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
                  <CreateQuestionForm
                    key={createType}
                    courseId={courseId}
                    quizId={quizId}
                    type={createType}
                    action={addQuizBuilderQuestion.bind(null, courseId, quizId)}
                  />
                </div>
              </div>
            ) : selectedQuestion ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Вопрос {selectedQuestionIndex + 1}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      {QUESTION_LABELS[(selectedQuestionType ?? selectedQuestion.type) as keyof typeof QUESTION_LABELS] ??
                        selectedQuestion.type}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {getQuestionSummary(selectedQuestionType, selectedQuestion.config)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form
                      action={moveQuizBuilderQuestion.bind(null, courseId, quizId, selectedQuestion.id, "UP")}
                    >
                      <button
                        type="submit"
                        disabled={selectedQuestionIndex <= 0}
                        className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        Выше
                      </button>
                    </form>
                    <form
                      action={moveQuizBuilderQuestion.bind(null, courseId, quizId, selectedQuestion.id, "DOWN")}
                    >
                      <button
                        type="submit"
                        disabled={selectedQuestionIndex === quiz.questions.length - 1}
                        className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        Ниже
                      </button>
                    </form>
                    <Link
                      href={buildBaseQuery({ edit: selectedQuestion.id, confirmDelete: selectedQuestion.id })}
                      className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Удалить
                    </Link>
                  </div>
                </div>

                {sp.confirmDelete === selectedQuestion.id ? (
                  <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/30">
                    <p className="text-red-700 dark:text-red-200">
                      Подтвердите удаление вопроса. Действие нельзя отменить.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <form action={deleteQuizBuilderQuestion.bind(null, courseId, quizId, selectedQuestion.id)}>
                        <button type="submit" className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white">
                          Да, удалить
                        </button>
                      </form>
                      <Link
                        href={buildBaseQuery({ edit: selectedQuestion.id })}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                      >
                        Отмена
                      </Link>
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
                  {selectedQuestionType && selectedQuestionInitialValues ? (
                    <EditQuestionForm
                      key={selectedQuestion.id}
                      courseId={courseId}
                      quizId={quizId}
                      type={selectedQuestionType}
                      action={updateQuizBuilderQuestion.bind(null, courseId, quizId, selectedQuestion.id)}
                      submitLabel="Сохранить вопрос"
                      initialPrompt={selectedQuestion.prompt}
                      initialPoints={selectedQuestion.points}
                      initialMedia={parseQuizQuestionMediaFromConfig(selectedQuestion.config)}
                      initialSingle={selectedQuestionInitialValues.single}
                      initialOpen={selectedQuestionInitialValues.open}
                      initialMatching={selectedQuestionInitialValues.matching}
                      initialFile={selectedQuestionInitialValues.file}
                    />
                  ) : (
                    <p className="text-sm text-red-700">Неподдерживаемый тип вопроса.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                <div>
                  <FileText className="mx-auto h-8 w-8 text-zinc-400" aria-hidden="true" />
                  <p className="mt-3">Выберите вопрос слева или добавьте новый.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function buildBaseQuery(params: {
  createType?: string;
  edit?: string;
  confirmDelete?: string;
  settings?: string;
}) {
  const search = new URLSearchParams();
  if (params.createType) search.set("createType", params.createType);
  if (params.edit) search.set("edit", params.edit);
  if (params.confirmDelete) search.set("confirmDelete", params.confirmDelete);
  if (params.settings) search.set("settings", params.settings);
  const query = search.toString();
  return query ? `?${query}` : "";
}

function QuestionTypeLink({
  label,
  value,
  activeType,
}: {
  label: string;
  value: QuizQuestionType;
  activeType: QuizQuestionType;
}) {
  return (
    <Link
      href={buildBaseQuery({ createType: value })}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        activeType === value
          ? "bg-white font-medium text-[#0f315d] shadow-[inset_0_-3px_0_#0f315d] dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[inset_0_-3px_0_#f4f4f5]"
          : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-950 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </Link>
  );
}

function normalizeQuestionType(value?: string | null): QuizQuestionType | null {
  if (value === "SINGLE_CHOICE" || value === "OPEN" || value === "MATCHING" || value === "FILE") {
    return value;
  }
  return null;
}

function getQuestionSummary(type: QuizQuestionType | null, configRaw: string) {
  const config = parseConfig(configRaw);
  const mediaSuffix = normalizeQuizQuestionMedia(config.media) ? ", медиа добавлено" : "";
  if (type === "SINGLE_CHOICE") {
    const options = Array.isArray(config.options) ? config.options.length : 0;
    return `вариантов ответа: ${options}${mediaSuffix}`;
  }
  if (type === "OPEN") {
    const base = config.reviewMode === "MANUAL" ? "ручная проверка" : "проверка по эталонному ответу";
    return `${base}${mediaSuffix}`;
  }
  if (type === "MATCHING") {
    const left = Array.isArray(config.left) ? config.left.length : 0;
    const right = Array.isArray(config.right) ? config.right.length : 0;
    return `пар: ${left}, элементов справа: ${right}${mediaSuffix}`;
  }
  if (type === "FILE") {
    const allowedExtensions = Array.isArray(config.allowedExtensions)
      ? config.allowedExtensions.map(String).join(", ")
      : "не заданы";
    const maxFileSizeMb = Number(config.maxFileSizeMb ?? 10);
    return `файлы: ${allowedExtensions}, до ${maxFileSizeMb} МБ${mediaSuffix}`;
  }
  return "без описания";
}

function getQuestionInitialValues(type: QuizQuestionType | null, configRaw: string): QuestionInitialValues {
  const config = parseConfig(configRaw);

  const options = asStringArray(config.options);
  const correctIndexRaw = Number(config.correctIndex);
  const correctIndex = Number.isInteger(correctIndexRaw) && correctIndexRaw >= 0 ? correctIndexRaw : 0;

  const sampleAnswer = typeof config.sampleAnswer === "string" ? config.sampleAnswer : "";
  const reviewMode = config.reviewMode === "MANUAL" ? "MANUAL" : "AUTO";

  const left = asStringArray(config.left);
  const right = asStringArray(config.right);
  const correctPairs = asIntArray(config.correctPairs);
  const allowedExtensions = asStringArray(config.allowedExtensions);
  const maxFileSizeMbRaw = Number(config.maxFileSizeMb);
  const maxFileSizeMb =
    Number.isFinite(maxFileSizeMbRaw) && maxFileSizeMbRaw >= 1 ? maxFileSizeMbRaw : 10;

  if (!type) {
    return {
      single: { options: ["", ""], correctIndex: 0 },
      open: { sampleAnswer: "", reviewMode: "AUTO" },
      matching: { left: ["", ""], right: ["", ""], correctPairs: [-1, -1] },
      file: { allowedExtensions: ["pdf", "docx"], maxFileSizeMb: 10 },
    };
  }

  return {
    single: {
      options: options.length >= 2 ? options : ["", ""],
      correctIndex,
    },
    open: {
      sampleAnswer,
      reviewMode,
    },
    matching: {
      left: left.length >= 2 ? left : ["", ""],
      right: right.length >= 2 ? right : ["", ""],
      correctPairs:
        correctPairs.length >= (left.length >= 2 ? left.length : 2)
          ? correctPairs
          : new Array(left.length >= 2 ? left.length : 2).fill(-1),
    },
    file: {
      allowedExtensions: allowedExtensions.length > 0 ? allowedExtensions : ["pdf", "docx"],
      maxFileSizeMb,
    },
  };
}

function parseConfig(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function asIntArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0);
}
