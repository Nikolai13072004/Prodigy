"use client";

import { useState } from "react";
import { Button, Progress, Select, Textarea } from "@/components/ui";
import { QuizQuestionMediaViewer } from "@/components/QuizQuestionMediaViewer";
import { QUESTION_LABELS } from "@/lib/constants";
import { parseQuizQuestionMediaFromConfig } from "@/lib/quiz-question-media";

type Question = {
  id: string;
  type: string;
  prompt: string;
  config: string;
  points: number;
};

type SingleChoiceConfig = { options: string[] };
type OpenConfig = { reviewMode?: "AUTO" | "MANUAL" };
type MatchConfig = { left: string[]; right: string[] };
type FileConfig = { allowedExtensions?: string[]; maxFileSizeMb?: number };

type Props = {
  questions: Question[];
};

export function QuizPreviewStepper({ questions }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  if (!currentQuestion) return null;

  return (
    <section className="mt-5 space-y-4">
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[var(--ink)]">
            Вопрос {currentIndex + 1} из {questions.length}
          </span>
          <span className="text-[var(--ink-muted)]">Режим предпросмотра</span>
        </div>
        <Progress
          className="mt-3"
          value={((currentIndex + 1) / questions.length) * 100}
        />
      </div>

      <article className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">
          {QUESTION_LABELS[currentQuestion.type as keyof typeof QUESTION_LABELS] ??
            currentQuestion.type}{" "}
          ({currentQuestion.points} б.)
        </div>
        <h2 className="mt-2 font-semibold">{currentQuestion.prompt}</h2>
        <QuizQuestionMediaViewer
          media={parseQuizQuestionMediaFromConfig(currentQuestion.config)}
          className="mt-4"
        />

        {currentQuestion.type === "SINGLE_CHOICE" && (
          <SingleChoicePreview configJson={currentQuestion.config} name={currentQuestion.id} />
        )}
        {currentQuestion.type === "OPEN" && (
          <OpenPreview configJson={currentQuestion.config} />
        )}
        {currentQuestion.type === "MATCHING" && (
          <MatchingPreview configJson={currentQuestion.config} questionId={currentQuestion.id} />
        )}
        {currentQuestion.type === "FILE" && (
          <FilePreview configJson={currentQuestion.config} />
        )}
      </article>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
        >
          Назад
        </Button>

        {!isLastQuestion && (
          <Button
            onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
          >
            Далее
          </Button>
        )}

        {isLastQuestion && (
          <Button disabled>
            Закончить тест (только предпросмотр)
          </Button>
        )}
      </div>
    </section>
  );
}

function OpenPreview({ configJson }: { configJson: string }) {
  const config = parseConfig<OpenConfig>(configJson, { reviewMode: "AUTO" });
  const isManualReview = config.reviewMode === "MANUAL";

  return (
    <div className="mt-3 space-y-2">
      <Textarea rows={4} disabled placeholder="Поле ответа сотрудника" />
      <p className="text-xs text-[var(--ink-muted)]">
        {isManualReview
          ? "Ответ будет отправлен преподавателю на проверку."
          : "Ответ будет проверен автоматически по эталону."}
      </p>
    </div>
  );
}

function SingleChoicePreview({ configJson, name }: { configJson: string; name: string }) {
  const config = parseConfig<SingleChoiceConfig>(configJson, { options: [] });

  return (
    <ul className="mt-3 space-y-2">
      {config.options.map((option, index) => (
        <li key={`${name}-${index}`}>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name={name} disabled className="mt-1" />
            <span>{option}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function MatchingPreview({
  configJson,
  questionId,
}: {
  configJson: string;
  questionId: string;
}) {
  const config = parseConfig<MatchConfig>(configJson, { left: [], right: [] });

  return (
    <div className="mt-3 space-y-3">
      {config.left.map((leftLabel, index) => (
        <div key={`${questionId}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="min-w-[180px] text-sm text-[var(--ink)]">{leftLabel}</span>
          <Select disabled className="max-w-xs">
            <option value="">Выберите вариант</option>
            {config.right.map((value, rightIndex) => (
              <option key={`${questionId}-opt-${rightIndex}`} value={rightIndex}>
                {value}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}

function FilePreview({ configJson }: { configJson: string }) {
  const config = parseConfig<FileConfig>(configJson, { allowedExtensions: [], maxFileSizeMb: 10 });
  const extensions = (config.allowedExtensions ?? [])
    .map((value) => value.trim().replace(/^\./, "").toUpperCase())
    .filter(Boolean);

  return (
    <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-sm font-medium text-[var(--ink)]">Загрузка файла</p>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        Допустимые форматы: {extensions.length ? extensions.join(", ") : "по настройке вопроса"}.
      </p>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Максимальный размер: {Math.max(config.maxFileSizeMb ?? 10, 1)} МБ.
      </p>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        После отправки такой ответ получит статус «На проверке».
      </p>
    </div>
  );
}

function parseConfig<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
