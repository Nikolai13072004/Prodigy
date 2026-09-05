"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Select } from "@/components/ui";
import {
  COURSE_SURVEY_QUESTION_TYPE_LABELS,
  type CourseSurveyQuestionDraft,
  type CourseSurveyQuestionType,
  formatCourseSurveyRequiredLabel,
  getDefaultCourseSurveyChoiceOptions,
  getCourseSurveyQuestionDescription,
  getCourseSurveyQuestionInputLabel,
} from "@/lib/course-surveys";

type Props = {
  initialQuestions: CourseSurveyQuestionDraft[];
};

export function CourseSurveyBuilder({ initialQuestions }: Props) {
  const [questions, setQuestions] = useState<CourseSurveyQuestionDraft[]>(() =>
    initialQuestions.map(normalizeQuestionDraft)
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const serializedQuestions = useMemo(() => JSON.stringify(questions), [questions]);
  const safeSelectedIndex =
    questions.length === 0 ? -1 : Math.min(Math.max(selectedIndex, 0), questions.length - 1);
  const selectedQuestion = safeSelectedIndex >= 0 ? questions[safeSelectedIndex] : null;

  function updateQuestion(index: number, patch: Partial<CourseSurveyQuestionDraft>) {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? normalizeQuestionDraft({ ...question, ...patch }) : question
      )
    );
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [question] = next.splice(index, 1);
      next.splice(nextIndex, 0, question);

      if (selectedIndex === index) {
        setSelectedIndex(nextIndex);
      } else if (selectedIndex === nextIndex) {
        setSelectedIndex(index);
      }

      return next;
    });
  }

  function removeQuestion(index: number) {
    setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index));
    setSelectedIndex((current) => (current > index ? current - 1 : Math.max(0, current - 1)));
  }

  function addQuestion(type: CourseSurveyQuestionType) {
    setQuestions((current) => {
      setSelectedIndex(current.length);
      return [
        ...current,
        {
          id: null,
          type,
          isRequired: type !== "TEXT",
          title:
            type === "RATING_5"
              ? "Новый вопрос с оценкой"
              : type === "SINGLE_CHOICE"
                ? "Новый вопрос с вариантами"
                : "Новый текстовый вопрос",
          options: type === "SINGLE_CHOICE" ? getDefaultCourseSurveyChoiceOptions() : [],
        },
      ];
    });
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex) return question;
        const options = [...question.options];
        options[optionIndex] = value;
        return { ...question, options };
      })
    );
  }

  function addOption(questionIndex: number) {
    setQuestions((current) =>
      current.map((question, index) =>
        index === questionIndex
          ? {
              ...question,
              options: [...question.options, `Вариант ответа ${question.options.length + 1}`],
            }
          : question
      )
    );
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    setQuestions((current) =>
      current.map((question, index) => {
        if (index !== questionIndex || question.options.length <= 2) return question;
        return {
          ...question,
          options: question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex),
        };
      })
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]">
      <input type="hidden" name="questionsJson" value={serializedQuestions} />

      <div className="grid min-h-[560px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--line)] bg-[var(--surface)] p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Содержание</p>
            <span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
              {questions.length} вопросов
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <Button onClick={() => addQuestion("SINGLE_CHOICE")} className="w-full">
              <Plus className="h-4 w-4" />
              Новый вопрос
            </Button>
            <div className="grid grid-cols-3 gap-1">
              <Button variant="secondary" size="sm" onClick={() => addQuestion("RATING_5")}>
                1-5
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addQuestion("SINGLE_CHOICE")}>
                Один
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addQuestion("TEXT")}>
                Текст
              </Button>
            </div>
          </div>

          <div className="mt-5">
            <div className="space-y-1">
              {questions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-muted)]">
                  Вопросов пока нет.
                </div>
              ) : (
                questions.map((question, index) => {
                  const isActive = index === safeSelectedIndex;
                  return (
                    <button
                      key={`${question.id ?? "new"}-${index}`}
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      className={`flex w-full gap-3 rounded-md border-l-2 px-3 py-2 text-left text-sm transition ${
                        isActive
                          ? "border-l-[var(--accent)] bg-[var(--surface-raised)] text-[var(--ink)] shadow-sm"
                          : "border-l-transparent text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                      }`}
                    >
                      <span className="w-5 shrink-0 text-right font-semibold">{index + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{question.title || "Без текста вопроса"}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--ink-muted)]">
                          {COURSE_SURVEY_QUESTION_TYPE_LABELS[question.type]}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 p-4">
          {selectedQuestion ? (
            <QuestionEditor
              question={selectedQuestion}
              index={safeSelectedIndex}
              total={questions.length}
              onUpdate={(patch) => updateQuestion(safeSelectedIndex, patch)}
              onMove={(direction) => moveQuestion(safeSelectedIndex, direction)}
              onRemove={() => removeQuestion(safeSelectedIndex)}
              onAddOption={() => addOption(safeSelectedIndex)}
              onUpdateOption={(optionIndex, value) => updateOption(safeSelectedIndex, optionIndex, value)}
              onRemoveOption={(optionIndex) => removeOption(safeSelectedIndex, optionIndex)}
            />
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center">
              <div>
                <p className="text-base font-semibold text-[var(--ink)]">Конструктор опроса</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">Создайте первый вопрос.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QuestionEditor({
  question,
  index,
  total,
  onUpdate,
  onMove,
  onRemove,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: {
  question: CourseSurveyQuestionDraft;
  index: number;
  total: number;
  onUpdate: (patch: Partial<CourseSurveyQuestionDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onAddOption: () => void;
  onUpdateOption: (optionIndex: number, value: string) => void;
  onRemoveOption: (optionIndex: number) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Вопрос {index + 1}</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">
            {COURSE_SURVEY_QUESTION_TYPE_LABELS[question.type]}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {getCourseSurveyQuestionInputLabel(question.type)} · {formatCourseSurveyRequiredLabel(question.isRequired)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index <= 0}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowUp className="h-4 w-4" />
            Выше
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index >= total - 1}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowDown className="h-4 w-4" />
            Ниже
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            <Trash2 className="h-4 w-4" />
            Удалить
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--line)] p-4">
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_220px]">
          <label className="grid min-w-0 gap-2 text-sm text-[var(--ink)]">
            <span>Текст вопроса</span>
            <textarea
              rows={4}
              value={question.title}
              onChange={(event) => onUpdate({ title: event.target.value })}
              className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          <div className="grid min-w-0 content-start gap-4">
            <label className="grid gap-2 text-sm text-[var(--ink)]">
              <span>Тип ответа</span>
              <Select
                value={question.type}
                onChange={(event) =>
                  onUpdate({
                    type: event.target.value as CourseSurveyQuestionType,
                  })
                }
              >
                {Object.entries(COURSE_SURVEY_QUESTION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={question.isRequired}
                onChange={(event) => onUpdate({ isRequired: event.target.checked })}
                className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <span>Обязательный вопрос</span>
            </label>
          </div>
        </div>

        {question.type === "SINGLE_CHOICE" ? (
          <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--ink)]">Варианты ответа</h3>
              <button
                type="button"
                onClick={onAddOption}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                <Plus className="h-4 w-4" />
                Добавить вариант
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {question.options.map((option, optionIndex) => (
                <div
                  key={`${question.id ?? "new"}-${index}-option-${optionIndex}`}
                  className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                >
                  <input
                    type="radio"
                    disabled
                    className="mt-2 h-4 w-4 border-[var(--line)] text-[var(--accent)] sm:mt-0"
                    aria-label={`Вариант ${optionIndex + 1}`}
                  />
                  <input
                    value={option}
                    onChange={(event) => onUpdateOption(optionIndex, event.target.value)}
                    placeholder={`Вариант ответа ${optionIndex + 1}`}
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveOption(optionIndex)}
                    disabled={question.options.length <= 2}
                    className="rounded-md border border-[var(--danger)] p-2 text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Удалить вариант ответа"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-xs text-[var(--ink-muted)]">{getCourseSurveyQuestionDescription(question.type)}</p>
      </div>
    </div>
  );
}

function normalizeQuestionDraft(question: CourseSurveyQuestionDraft): CourseSurveyQuestionDraft {
  if (question.type !== "SINGLE_CHOICE") {
    return { ...question, options: [] };
  }

  const normalizedOptions = question.options.map((option) => option.trim()).filter(Boolean);

  return {
    ...question,
    options: normalizedOptions.length >= 2 ? normalizedOptions : getDefaultCourseSurveyChoiceOptions(),
  };
}
