"use client";

import { Check } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button, Textarea } from "@/components/ui";
import {
  COURSE_SURVEY_QUESTION_TYPE_LABELS,
  type CourseSurveyQuestionType,
} from "@/lib/course-surveys";

type SurveyQuestion = {
  id: string;
  title: string;
  type: CourseSurveyQuestionType;
  isRequired: boolean;
  options: string[];
};

type ExistingAnswers = Record<string, { ratingValue: number | null; textValue: string | null }>;
type SubmitAction = (formData: FormData) => void | Promise<void>;

type Props = {
  introTitle: string;
  introDescription?: string | null;
  introImageUrl?: string | null;
  questions: SurveyQuestion[];
  submitAction?: SubmitAction;
  existingAnswers?: ExistingAnswers;
  submitLabel?: string;
  saved?: boolean;
  locked?: boolean;
  previewMode?: boolean;
};

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

export function CourseSurveyForm({
  introTitle,
  introDescription,
  introImageUrl,
  questions,
  submitAction,
  existingAnswers = {},
  submitLabel = "Сохранить ответы",
  saved: initialSaved = false,
  locked = false,
  previewMode = false,
}: Props) {
  const finishStep = questions.length + 1;
  const [currentStep, setCurrentStep] = useState(initialSaved || locked ? finishStep : 0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, getInitialAnswer(question, existingAnswers)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(initialSaved || locked);
  const lockedAfterSubmit = saved || locked;

  const currentQuestion = currentStep > 0 && currentStep <= questions.length ? questions[currentStep - 1] : null;
  const isIntroStep = currentStep === 0;
  const isFinishStep = currentStep === finishStep;
  const answeredCount = useMemo(
    () => questions.filter((question) => hasAnswer(question, answers[question.id])).length,
    [answers, questions]
  );
  const progressPercent = isFinishStep
    ? 100
    : Math.max(8, Math.round(((currentStep + 1) / (questions.length + 2)) * 100));

  function setAnswer(questionId: string, value: string) {
    if (lockedAfterSubmit) return;
    setSaved(false);
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function goNext() {
    if (currentQuestion?.isRequired && !hasAnswer(currentQuestion, answers[currentQuestion.id])) {
      setError("Ответьте на текущий вопрос, чтобы перейти дальше");
      return;
    }

    setError(null);
    setCurrentStep((current) => Math.min(current + 1, finishStep));
  }

  function goPrev() {
    if (lockedAfterSubmit) return;
    setError(null);
    setCurrentStep((current) => Math.max(current - 1, 0));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (previewMode || lockedAfterSubmit) {
      event.preventDefault();
      return;
    }

    const firstMissingIndex = questions.findIndex(
      (question) => question.isRequired && !hasAnswer(question, answers[question.id])
    );
    if (firstMissingIndex >= 0) {
      event.preventDefault();
      setCurrentStep(firstMissingIndex + 1);
      setError("Заполните обязательные вопросы перед отправкой опроса");
      return;
    }

    setError(null);
  }

  const className =
    "mx-auto flex h-[640px] min-h-[520px] max-h-[calc(100dvh-160px)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-xl";

  const content = (
    <>
      <div className="m-4 flex-none rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[var(--ink)]">
            {isIntroStep
              ? "Титульный лист"
              : isFinishStep
                ? "Завершение"
                : `Вопрос ${currentStep} из ${questions.length}`}
          </span>
          <span className="text-[var(--ink-muted)]">
            Отвечено: {answeredCount}/{questions.length}
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[var(--line)]">
          <div
            className="h-2 rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {isIntroStep ? (
          <SurveyIntroStep
            title={introTitle}
            description={introDescription}
            imageUrl={introImageUrl}
            questionsCount={questions.length}
          />
        ) : currentQuestion ? (
          <SurveyQuestionStep
            question={currentQuestion}
            index={currentStep - 1}
            value={answers[currentQuestion.id] ?? ""}
            onChange={(value) => setAnswer(currentQuestion.id, value)}
          />
        ) : isFinishStep ? (
          <SurveyFinishStep
            saved={saved}
            locked={locked}
            answeredCount={answeredCount}
            questionsCount={questions.length}
          />
        ) : null}
      </div>

      <div className="flex-none border-t border-[var(--line)] bg-[var(--surface-raised)] px-4 py-4">
        <div className="min-h-5 text-sm text-[var(--danger)]">{error}</div>

        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={goPrev}
            disabled={currentStep === 0 || lockedAfterSubmit}
          >
            Назад
          </Button>

          {!isFinishStep ? (
            <Button onClick={goNext}>Далее</Button>
          ) : (
            <Button
              type={previewMode ? "button" : "submit"}
              disabled={previewMode || lockedAfterSubmit}
            >
              {previewMode
                ? "Предпросмотр"
                : lockedAfterSubmit
                  ? "Опрос пройден"
                  : submitLabel}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (previewMode) {
    return <div className={className}>{content}</div>;
  }

  return (
    <form
      action={submitAction}
      onSubmit={onSubmit}
      className={className}
    >
      {content}
      {questions.map((question) => (
        <input
          key={question.id}
          type="hidden"
          name={`question:${question.id}`}
          value={answers[question.id] ?? ""}
          readOnly
        />
      ))}
    </form>
  );
}

function SurveyFinishStep({
  saved,
  locked,
  answeredCount,
  questionsCount,
}: {
  saved: boolean;
  locked: boolean;
  answeredCount: number;
  questionsCount: number;
}) {
  return (
    <section className="flex min-h-full items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-6 text-center shadow-sm">
      <div className="max-w-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--success)]">
          <Check className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-[var(--ink)]">
          {locked ? "Опрос уже пройден" : saved ? "Опрос отправлен" : "Все готово к отправке"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
          {locked
            ? "Ответы сохранены. Повторное заполнение недоступно."
            : saved
              ? "Ответы сохранены. Спасибо за обратную связь."
              : "Проверьте ответы при необходимости кнопкой «Назад» и отправьте опрос."}
        </p>
        <p className="mt-4 text-sm font-medium text-[var(--ink)]">
          Заполнено: {answeredCount}/{questionsCount}
        </p>
      </div>
    </section>
  );
}

function SurveyIntroStep({
  title,
  description,
  imageUrl,
  questionsCount,
}: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  questionsCount: number;
}) {
  return (
    <section className="h-full min-h-[320px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
      <div className="relative flex min-h-full items-end bg-[var(--surface)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-white/10" />
        <div className="relative w-full p-6 text-white sm:p-8">
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-4 max-w-3xl text-sm font-medium leading-6 text-white/90 sm:text-base">
              {description}
            </p>
          ) : null}
          <p className="mt-5 text-sm text-white/80">Вопросов: {questionsCount}</p>
        </div>
      </div>
    </section>
  );
}

function SurveyQuestionStep({
  question,
  index,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  index: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="min-h-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Вопрос {index + 1}</p>
        <h2 className="mt-1 text-lg font-semibold leading-7 text-[var(--ink)]">{question.title}</h2>
      </div>

      <p className="mt-2 text-xs font-medium text-[var(--ink-muted)]">
        {COURSE_SURVEY_QUESTION_TYPE_LABELS[question.type]}
      </p>

      {question.type === "RATING_5" ? (
        <fieldset className="mt-4">
          <legend className="sr-only">{question.title}</legend>
          <div className="flex flex-wrap gap-2">
            {RATING_OPTIONS.map((rating) => {
              const checked = value === String(rating);
              return (
                <label
                  key={rating}
                  className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold transition ${
                    checked
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={`display_${question.id}`}
                    value={rating}
                    checked={checked}
                    className="sr-only"
                    onChange={(event) => onChange(event.target.value)}
                  />
                  {rating}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {question.type === "SINGLE_CHOICE" ? (
        <fieldset className="mt-4">
          <legend className="sr-only">{question.title}</legend>
          <div className="space-y-2">
            {question.options.map((option, optionIndex) => {
              const checked = value === option;
              return (
                <label
                  key={`${question.id}-${optionIndex}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                    checked
                      ? "border-[var(--accent)] bg-[var(--surface)] text-[var(--ink)]"
                      : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={`display_${question.id}`}
                    value={option}
                    checked={checked}
                    onChange={(event) => onChange(event.target.value)}
                    className="mt-1 h-4 w-4 border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {question.type === "TEXT" ? (
        <label className="mt-4 block">
          <span className="sr-only">{question.title}</span>
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={5}
            placeholder="Напишите ваш ответ"
          />
        </label>
      ) : null}
    </section>
  );
}

function getInitialAnswer(question: SurveyQuestion, existingAnswers: ExistingAnswers) {
  const existing = existingAnswers[question.id];

  if (question.type === "RATING_5") {
    return typeof existing?.ratingValue === "number" ? String(existing.ratingValue) : "";
  }

  if (question.type === "SINGLE_CHOICE") {
    const selected = existing?.textValue?.trim() ?? "";
    return question.options.includes(selected) ? selected : "";
  }

  return existing?.textValue ?? "";
}

function hasAnswer(question: SurveyQuestion, value: string | undefined) {
  const answer = value ?? "";

  if (question.type === "SINGLE_CHOICE") {
    return question.options.includes(answer);
  }

  return answer.trim().length > 0;
}
