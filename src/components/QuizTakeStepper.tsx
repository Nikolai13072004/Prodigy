"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

type SingleChoiceConfig = { options: string[]; correctIndex: number };
type OpenConfig = { reviewMode?: "AUTO" | "MANUAL" };
type MatchConfig = { left: string[]; right: string[] };
type FileConfig = { allowedExtensions?: string[]; maxFileSizeMb?: number };
type UploadedFileAnswer = { url: string; fileName: string; size: number };

type AnswerValue = string | string[];

type SubmitAction = (formData: FormData) => void | Promise<void>;
type SaveDraftAction = (formData: FormData) => Promise<{ saved: boolean } | void> | { saved: boolean } | void;

type Props = {
  courseId: string;
  quizId: string;
  questions: Question[];
  submitAction: SubmitAction;
  saveDraftAction?: SaveDraftAction;
  initialAnswers?: Record<string, AnswerValue>;
  hasInProgressAttempt?: boolean;
  expiresAt?: string | null;
  timeLimitMinutes?: number | null;
  trackSecurityEvents?: boolean;
};

export function QuizTakeStepper({
  courseId,
  quizId,
  questions,
  submitAction,
  saveDraftAction,
  initialAnswers,
  hasInProgressAttempt = false,
  expiresAt = null,
  timeLimitMinutes = null,
  trackSecurityEvents = false,
}: Props) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(initialAnswers ?? {});
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [securityEvents, setSecurityEvents] = useState<Array<{ type: string; at: string }>>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const saveDraftActionRef = useRef(saveDraftAction);
  const hasAutoSubmittedRef = useRef(false);
  const initialSignature = useMemo(
    () => serializeAnswersSignature(questions, initialAnswers ?? {}),
    [initialAnswers, questions]
  );
  const lastSavedSignatureRef = useRef(hasInProgressAttempt ? initialSignature : "");
  const hasRefreshedForDraftRef = useRef(hasInProgressAttempt);
  const remainingMs = useMemo(() => getRemainingMs(expiresAt, nowMs), [expiresAt, nowMs]);
  const isExpired = remainingMs !== null && remainingMs <= 0;

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const answeredCount = useMemo(
    () => questions.filter((question) => isAnswered(question, answers[question.id])).length,
    [answers, questions]
  );
  const hasAnyAnswer = useMemo(
    () => questions.some((question) => hasAnyAnswerValue(question, answers[question.id])),
    [answers, questions]
  );
  const statusLabel = hasInProgressAttempt || hasAnyAnswer ? "В работе" : "Не начато";
  const timerLabel =
    remainingMs !== null
      ? isExpired
        ? "Время вышло"
        : `Осталось: ${formatRemainingTime(remainingMs)}`
      : null;

  useEffect(() => {
    saveDraftActionRef.current = saveDraftAction;
  }, [saveDraftAction]);

  useEffect(() => {
    if (!saveDraftActionRef.current || !hasAnyAnswer || isExpired) return;
    const signature = serializeAnswersSignature(questions, answers);
    if (signature === lastSavedSignatureRef.current) return;

    const timeoutId = window.setTimeout(() => {
      const formData = buildAnswersFormData(questions, answers);
      void Promise.resolve(saveDraftActionRef.current?.(formData))
        .then((result) => {
          if (result?.saved) {
            lastSavedSignatureRef.current = signature;
            if (!hasRefreshedForDraftRef.current) {
              hasRefreshedForDraftRef.current = true;
              router.refresh();
            }
          }
        })
        .catch(() => undefined);
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [answers, hasAnyAnswer, isExpired, questions, router]);

  useEffect(() => {
    hasAutoSubmittedRef.current = false;
  }, [expiresAt]);

  useEffect(() => {
    if (!expiresAt) return;

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [expiresAt]);

  useEffect(() => {
    if (!isExpired || hasAutoSubmittedRef.current) return;
    hasAutoSubmittedRef.current = true;
    window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  }, [isExpired]);

  useEffect(() => {
    if (!trackSecurityEvents) return;

    const recordEvent = (type: string) => {
      setSecurityEvents((prev) => [...prev.slice(-49), { type, at: new Date().toISOString() }]);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") recordEvent("visibility_hidden");
    };
    const onWindowBlur = () => recordEvent("window_blur");
    const onBeforeUnload = () => recordEvent("before_unload");

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [trackSecurityEvents]);

  function goNext() {
    if (isExpired) return;
    if (!isAnswered(currentQuestion, answers[currentQuestion.id])) {
      setError("Ответьте на текущий вопрос, чтобы перейти дальше");
      return;
    }
    setError(null);
    setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }

  function goPrev() {
    if (isExpired) return;
    setError(null);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (isExpired) {
      setError(null);
      return;
    }

    const hasUnanswered = questions.some((question) => !isAnswered(question, answers[question.id]));
    if (hasUnanswered) {
      event.preventDefault();
      setError("Нужно ответить на все вопросы перед завершением теста");
      return;
    }
    setError(null);
  }

  return (
    <form ref={formRef} action={submitAction} onSubmit={onSubmit} className="mt-8 space-y-5">
      <div className="rounded-lg border border-black bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-medium text-zinc-700">
            Вопрос {currentIndex + 1} из {questions.length}
          </span>
          <div className="flex flex-wrap items-center gap-2 text-zinc-600">
            {timerLabel ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isExpired ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {timerLabel}
              </span>
            ) : timeLimitMinutes ? (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                Лимит: {timeLimitMinutes} мин.
              </span>
            ) : null}
            <span>
              {statusLabel} · отвечено: {answeredCount}/{questions.length}
            </span>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-zinc-200">
          <div
            className="h-2 rounded-full bg-teal-600 transition-all"
            style={{ width: `${Math.round(((currentIndex + 1) / questions.length) * 100)}%` }}
          />
        </div>
      </div>

      <fieldset disabled={isExpired} className="rounded-lg border border-black bg-white p-4 disabled:opacity-70">
        <legend className="px-1 text-xs font-medium text-zinc-500">
          {QUESTION_LABELS[currentQuestion.type as keyof typeof QUESTION_LABELS] ?? currentQuestion.type} (
          {currentQuestion.points} б.)
        </legend>
        <p className="mt-2 text-sm font-medium text-zinc-900">{currentQuestion.prompt}</p>
        <QuizQuestionMediaViewer
          media={parseQuizQuestionMediaFromConfig(currentQuestion.config)}
          className="mt-4"
        />

        {currentQuestion.type === "SINGLE_CHOICE" && (
          <SingleChoiceField
            question={currentQuestion}
            value={typeof answers[currentQuestion.id] === "string" ? (answers[currentQuestion.id] as string) : ""}
            onChange={(value) =>
              setAnswers((prev) => ({
                ...prev,
                [currentQuestion.id]: value,
              }))
            }
          />
        )}

        {currentQuestion.type === "OPEN" && (
          <OpenField
            question={currentQuestion}
            value={typeof answers[currentQuestion.id] === "string" ? (answers[currentQuestion.id] as string) : ""}
            onChange={(value) =>
              setAnswers((prev) => ({
                ...prev,
                [currentQuestion.id]: value,
              }))
            }
          />
        )}

        {currentQuestion.type === "MATCHING" && (
          <MatchingField
            question={currentQuestion}
            value={Array.isArray(answers[currentQuestion.id]) ? (answers[currentQuestion.id] as string[]) : undefined}
            onChange={(leftIndex, selected) => {
              const config = parseConfig<MatchConfig>(currentQuestion.config, { left: [], right: [] });
              setAnswers((prev) => {
                const existing = Array.isArray(prev[currentQuestion.id])
                  ? [...(prev[currentQuestion.id] as string[])]
                  : new Array(config.left.length).fill("");
                existing[leftIndex] = selected;
                return {
                  ...prev,
                  [currentQuestion.id]: existing,
                };
              });
            }}
          />
        )}

        {currentQuestion.type === "FILE" && (
          <FileField
            courseId={courseId}
            quizId={quizId}
            question={currentQuestion}
            value={typeof answers[currentQuestion.id] === "string" ? (answers[currentQuestion.id] as string) : ""}
            onChange={(value) =>
              setAnswers((prev) => ({
                ...prev,
                [currentQuestion.id]: value,
              }))
            }
          />
        )}
      </fieldset>

      {isExpired ? (
        <p className="text-sm text-amber-700">Время на тест вышло. Отправляем текущие ответы.</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0 || isExpired}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Назад
        </button>

        {!isLastQuestion && (
          <button
            type="button"
            onClick={goNext}
            disabled={isExpired}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Далее
          </button>
        )}

        {isLastQuestion && (
          <button
            type="submit"
            className="rounded-md bg-teal-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            {isExpired ? "Отправить результат" : "Закончить тест"}
          </button>
        )}
      </div>

      {questions.map((question) => {
        const answer = answers[question.id];
        return renderHiddenAnswerInputs(question, answer);
      })}
      {trackSecurityEvents ? (
        <input type="hidden" name="securityEventsJson" value={JSON.stringify(securityEvents)} />
      ) : null}
    </form>
  );
}

function OpenField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  const config = parseConfig<OpenConfig>(question.config, { reviewMode: "AUTO" });
  const isManualReview = config.reviewMode === "MANUAL";

  return (
    <div className="mt-3 space-y-2">
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
      <p className="text-xs text-zinc-500">
        {isManualReview
          ? "Этот ответ проверит преподаватель. После отправки тест получит статус «На проверке»."
          : "Ответ будет проверен автоматически по эталону."}
      </p>
    </div>
  );
}

function SingleChoiceField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  const config = parseConfig<SingleChoiceConfig>(question.config, { options: [], correctIndex: 0 });

  return (
    <ul className="mt-3 space-y-2">
      {config.options.map((option, index) => (
        <li key={`${question.id}-${index}`}>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name={`display_${question.id}`}
              value={index}
              checked={value === String(index)}
              onChange={(event) => onChange(event.target.value)}
              className="mt-1"
            />
            <span>{option}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function MatchingField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value?: string[];
  onChange: (leftIndex: number, selected: string) => void;
}) {
  const config = parseConfig<MatchConfig>(question.config, { left: [], right: [] });

  return (
    <div className="mt-3 space-y-3">
      {config.left.map((leftLabel, index) => (
        <div key={`${question.id}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="min-w-[180px] text-sm text-zinc-800">{leftLabel}</span>
          <select
            value={value?.[index] ?? ""}
            onChange={(event) => onChange(index, event.target.value)}
            className="w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Выберите вариант</option>
            {config.right.map((rightLabel, rightIndex) => (
              <option key={`${question.id}-right-${rightIndex}`} value={rightIndex}>
                {rightLabel}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function FileField({
  courseId,
  quizId,
  question,
  value,
  onChange,
}: {
  courseId: string;
  quizId: string;
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  const config = parseConfig<FileConfig>(question.config, { allowedExtensions: [], maxFileSizeMb: 10 });
  const allowedExtensions = (config.allowedExtensions ?? [])
    .map((entry) => entry.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  const maxFileSizeMb = Math.max(config.maxFileSizeMb ?? 10, 1);
  const uploadedFile = parseUploadedFileAnswer(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("courseId", courseId);
      formData.append("quizId", quizId);
      formData.append("questionId", question.id);
      formData.append("file", file);

      const response = await fetch("/api/quiz-attachments", {
        method: "POST",
        body: formData,
      });
      const raw = await response.text();
      let payload: { url?: string; fileName?: string; size?: number; error?: string } = {};
      if (raw) {
        try {
          payload = JSON.parse(raw) as { url?: string; fileName?: string; size?: number; error?: string };
        } catch {
          payload = { error: `Сервер вернул некорректный ответ (${response.status}).` };
        }
      }

      if (!response.ok) {
        throw new Error(payload.error ?? `Не удалось загрузить файл (${response.status}).`);
      }

      if (!payload.url || !payload.fileName || typeof payload.size !== "number") {
        throw new Error("Сервер не вернул параметры загруженного файла.");
      }

      onChange(
        JSON.stringify({
          url: payload.url,
          fileName: payload.fileName,
          size: payload.size,
        })
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить файл.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
        <p className="text-sm text-zinc-700">
          Допустимые форматы: {allowedExtensions.length ? allowedExtensions.map((ext) => ext.toUpperCase()).join(", ") : "по настройке вопроса"}.
        </p>
        <p className="mt-1 text-sm text-zinc-700">Максимальный размер: {maxFileSizeMb} МБ.</p>
      </div>

      {uploadedFile ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Файл прикреплен</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={uploadedFile.url}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {uploadedFile.fileName}
            </a>
            <span>· {formatFileSize(uploadedFile.size)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50">
              {busy ? "Загрузка..." : "Заменить файл"}
              <input
                type="file"
                accept={buildAcceptList(allowedExtensions)}
                className="sr-only"
                onChange={onFileChange}
                disabled={busy}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setError(null);
                onChange("");
              }}
              className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Удалить файл
            </button>
          </div>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-black px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
          {busy ? "Загрузка..." : "Загрузить файл"}
          <input
            type="file"
            accept={buildAcceptList(allowedExtensions)}
            className="sr-only"
            onChange={onFileChange}
            disabled={busy}
          />
        </label>
      )}

      <p className="text-xs text-zinc-500">
        После отправки ответ будет ждать проверки преподавателя.
      </p>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
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

function isAnswered(question: Question, answer: AnswerValue | undefined) {
  if (question.type === "SINGLE_CHOICE") {
    return typeof answer === "string" && answer !== "";
  }

  if (question.type === "OPEN") {
    return typeof answer === "string" && answer.trim().length > 0;
  }

  if (question.type === "FILE") {
    return parseUploadedFileAnswer(typeof answer === "string" ? answer : null) !== null;
  }

  if (question.type === "MATCHING") {
    const config = parseConfig<MatchConfig>(question.config, { left: [], right: [] });
    if (!Array.isArray(answer)) return false;
    if (answer.length !== config.left.length) return false;
    return answer.every((value) => value !== "");
  }

  return false;
}

function hasAnyAnswerValue(question: Question, answer: AnswerValue | undefined) {
  if (question.type === "MATCHING") {
    if (!Array.isArray(answer)) return false;
    return answer.some((value) => value !== "");
  }
  if (question.type === "FILE") {
    return parseUploadedFileAnswer(typeof answer === "string" ? answer : null) !== null;
  }
  return typeof answer === "string" && answer.trim().length > 0;
}

function renderHiddenAnswerInputs(question: Question, answer: AnswerValue | undefined) {
  if (question.type === "MATCHING") {
    const config = parseConfig<MatchConfig>(question.config, { left: [], right: [] });
    const values = Array.isArray(answer) ? answer : [];
    return config.left.map((_, index) => (
      <input
        key={`${question.id}-${index}`}
        type="hidden"
        name={`q_${question.id}_${index}`}
        value={values[index] ?? ""}
      />
    ));
  }

  return (
    <input
      key={question.id}
      type="hidden"
      name={`q_${question.id}`}
      value={typeof answer === "string" ? answer : ""}
    />
  );
}

function buildAnswersFormData(questions: Question[], answers: Record<string, AnswerValue>) {
  const formData = new FormData();
  for (const question of questions) {
    const answer = answers[question.id];
    if (question.type === "MATCHING") {
      const config = parseConfig<MatchConfig>(question.config, { left: [], right: [] });
      const values = Array.isArray(answer) ? answer : [];
      for (let index = 0; index < config.left.length; index += 1) {
        formData.set(`q_${question.id}_${index}`, values[index] ?? "");
      }
      continue;
    }
    formData.set(`q_${question.id}`, typeof answer === "string" ? answer : "");
  }
  return formData;
}

function serializeAnswersSignature(questions: Question[], answers: Record<string, AnswerValue>) {
  return JSON.stringify(
    questions.map((question) => {
      const answer = answers[question.id];
      if (question.type === "MATCHING") {
        const config = parseConfig<MatchConfig>(question.config, { left: [], right: [] });
        const values = Array.isArray(answer) ? answer : [];
        return [question.id, values.slice(0, config.left.length).map((value) => value ?? "")];
      }
      return [question.id, typeof answer === "string" ? answer : ""];
    })
  );
}

function getRemainingMs(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return null;
  const timestamp = new Date(expiresAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(timestamp - nowMs, 0);
}

function formatRemainingTime(valueMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseUploadedFileAnswer(raw: string | null | undefined): UploadedFileAnswer | null {
  if (!raw?.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<UploadedFileAnswer>;
    if (
      typeof parsed.url !== "string" ||
      !parsed.url.startsWith("/uploads/quiz-attachments/") ||
      typeof parsed.fileName !== "string" ||
      !parsed.fileName.trim() ||
      typeof parsed.size !== "number" ||
      !Number.isFinite(parsed.size) ||
      parsed.size < 1
    ) {
      return null;
    }

    return {
      url: parsed.url,
      fileName: parsed.fileName,
      size: parsed.size,
    };
  } catch {
    return null;
  }
}

function buildAcceptList(extensions: string[]) {
  return extensions.map((entry) => `.${entry}`).join(",");
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} КБ`;
  }
  return `${size} Б`;
}
