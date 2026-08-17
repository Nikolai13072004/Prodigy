"use client";

import { useState } from "react";
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
      <div className="rounded-lg border border-black bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-medium text-zinc-700">
            Вопрос {currentIndex + 1} из {questions.length}
          </span>
          <span className="text-zinc-600">Режим предпросмотра</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-zinc-200">
          <div
            className="h-2 rounded-full bg-zinc-900 transition-all"
            style={{ width: `${Math.round(((currentIndex + 1) / questions.length) * 100)}%` }}
          />
        </div>
      </div>

      <article className="rounded-xl border border-black bg-white p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
        <button
          type="button"
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Назад
        </button>

        {!isLastQuestion && (
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Далее
          </button>
        )}

        {isLastQuestion && (
          <button
            type="button"
            disabled
            className="rounded-md bg-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-600"
          >
            Закончить тест (только предпросмотр)
          </button>
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
      <textarea
        rows={4}
        disabled
        placeholder="Поле ответа сотрудника"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <p className="text-xs text-zinc-500">
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
          <span className="min-w-[180px] text-sm text-zinc-800">{leftLabel}</span>
          <select
            disabled
            className="w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Выберите вариант</option>
            {config.right.map((value, rightIndex) => (
              <option key={`${questionId}-opt-${rightIndex}`} value={rightIndex}>
                {value}
              </option>
            ))}
          </select>
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
    <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
      <p className="text-sm font-medium text-zinc-900">Загрузка файла</p>
      <p className="mt-2 text-sm text-zinc-600">
        Допустимые форматы: {extensions.length ? extensions.join(", ") : "по настройке вопроса"}.
      </p>
      <p className="mt-1 text-sm text-zinc-600">
        Максимальный размер: {Math.max(config.maxFileSizeMb ?? 10, 1)} МБ.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
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
