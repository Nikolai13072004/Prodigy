"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, GripVertical, ImagePlus, Plus, Trash2 } from "lucide-react";
import { type ChangeEvent, type FormEvent, useMemo, useRef, useState } from "react";
import { QuizQuestionMediaViewer } from "@/components/QuizQuestionMediaViewer";
import type { QuizQuestionMedia } from "@/lib/quiz-question-media";

export type QuizQuestionType = "SINGLE_CHOICE" | "OPEN" | "MATCHING" | "FILE";

const QUESTION_TYPE_TITLES: Record<QuizQuestionType, string> = {
  SINGLE_CHOICE: "Выбор одного ответа",
  OPEN: "Открытый ответ",
  MATCHING: "Соответствие",
  FILE: "Ответ файлом",
};

type ServerAction = (formData: FormData) => void | Promise<void>;

type SingleSeed = {
  options: string[];
  correctIndex: number;
};

type OpenSeed = {
  sampleAnswer: string;
  reviewMode: "AUTO" | "MANUAL";
};

type MatchingSeed = {
  left: string[];
  right: string[];
  correctPairs: number[];
};

type FileSeed = {
  allowedExtensions: string[];
  maxFileSizeMb: number;
};

type SharedProps = {
  courseId: string;
  quizId: string;
  type: QuizQuestionType;
  action: ServerAction;
  submitLabel: string;
  initialPrompt?: string;
  initialPoints?: number;
  initialMedia?: QuizQuestionMedia | null;
  initialSingle?: SingleSeed;
  initialOpen?: OpenSeed;
  initialMatching?: MatchingSeed;
  initialFile?: FileSeed;
  cancelHref?: string;
};

export function CreateQuestionForm({
  courseId,
  quizId,
  type,
  action,
}: {
  courseId: string;
  quizId: string;
  type: QuizQuestionType;
  action: ServerAction;
}) {
  return (
    <QuestionForm
      key={type}
      courseId={courseId}
      quizId={quizId}
      type={type}
      action={action}
      submitLabel="Добавить вопрос"
      initialPoints={1}
    />
  );
}

export function EditQuestionForm(props: SharedProps) {
  return <QuestionForm {...props} submitLabel={props.submitLabel || "Сохранить вопрос"} />;
}

function QuestionForm({
  courseId,
  quizId,
  type,
  action,
  submitLabel,
  initialPrompt,
  initialPoints,
  initialMedia,
  initialSingle,
  initialOpen,
  initialMatching,
  initialFile,
  cancelHref,
}: SharedProps) {
  const [singleOptions, setSingleOptions] = useState(() => {
    const source = initialSingle?.options?.map((value) => value.trim()).filter(Boolean) ?? [];
    return source.length >= 2 ? source : ["", ""];
  });
  const [singleCorrectIndex, setSingleCorrectIndex] = useState(() => {
    const maxIndex = Math.max(0, singleOptions.length - 1);
    const seeded = initialSingle?.correctIndex ?? 0;
    return seeded >= 0 && seeded <= maxIndex ? seeded : 0;
  });

  const [sampleAnswer, setSampleAnswer] = useState(initialOpen?.sampleAnswer ?? "");
  const [openReviewMode, setOpenReviewMode] = useState<"AUTO" | "MANUAL">(
    initialOpen?.reviewMode ?? "AUTO"
  );

  const [matchingLeft, setMatchingLeft] = useState(() => {
    const source = initialMatching?.left?.map((value) => value.trim()).filter(Boolean) ?? [];
    return source.length >= 2 ? source : ["", ""];
  });
  const [matchingRight, setMatchingRight] = useState(() => {
    const source = initialMatching?.right?.map((value) => value.trim()).filter(Boolean) ?? [];
    return source.length >= 2 ? source : ["", ""];
  });
  const [matchingPairs, setMatchingPairs] = useState(() => {
    const source = initialMatching?.correctPairs ?? [];
    return matchingLeft.map((_, index) => {
      const candidate = source[index];
      return Number.isInteger(candidate) && candidate >= 0 ? candidate : -1;
    });
  });

  const [fileExtensions, setFileExtensions] = useState(
    (initialFile?.allowedExtensions ?? ["pdf", "docx"]).join(", ")
  );
  const [fileMaxSizeMb, setFileMaxSizeMb] = useState(initialFile?.maxFileSizeMb ?? 10);
  const [media, setMedia] = useState<QuizQuestionMedia | null>(initialMedia ?? null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [localError, setLocalError] = useState<string | null>(null);

  const canMoveSingleOption = useMemo(() => singleOptions.length > 1, [singleOptions.length]);

  function updateSingleOption(index: number, value: string) {
    setSingleOptions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  }

  function moveSingleOption(index: number, direction: "UP" | "DOWN") {
    setSingleOptions((prev) => {
      const target = direction === "UP" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSingleCorrectIndex((prev) => {
      const target = direction === "UP" ? index - 1 : index + 1;
      if (target < 0 || target >= singleOptions.length) return prev;
      if (prev === index) return target;
      if (prev === target) return index;
      return prev;
    });
  }

  function addSingleOption() {
    setSingleOptions((prev) => [...prev, ""]);
  }

  function removeSingleOption(index: number) {
    setSingleOptions((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
    setSingleCorrectIndex((prev) => {
      if (singleOptions.length <= 2) return prev;
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
  }

  function updateLeft(index: number, value: string) {
    setMatchingLeft((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  }

  function updateRight(index: number, value: string) {
    setMatchingRight((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  }

  function updatePair(index: number, value: string) {
    const parsed = Number.parseInt(value, 10);
    setMatchingPairs((prev) => prev.map((item, idx) => (idx === index ? parsed - 1 : item)));
  }

  function addLeft() {
    setMatchingLeft((prev) => [...prev, ""]);
    setMatchingPairs((prev) => [...prev, -1]);
  }

  function removeLeft(index: number) {
    setMatchingLeft((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
    setMatchingPairs((prev) => {
      if (matchingLeft.length <= 2) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
  }

  function addRight() {
    setMatchingRight((prev) => [...prev, ""]);
  }

  function removeRight(index: number) {
    setMatchingRight((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
    setMatchingPairs((prev) =>
      prev.map((pair) => {
        if (matchingRight.length <= 2) return pair;
        if (pair === index) return -1;
        if (pair > index) return pair - 1;
        return pair;
      })
    );
  }

  async function uploadQuestionMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMediaBusy(true);
    setMediaError(null);

    try {
      const formData = new FormData();
      formData.append("courseId", courseId);
      formData.append("quizId", quizId);
      formData.append("file", file);

      const response = await fetch("/api/quiz-question-media", {
        method: "POST",
        body: formData,
      });
      const raw = await response.text();
      let payload: { media?: QuizQuestionMedia; error?: string } = {};
      if (raw) {
        try {
          payload = JSON.parse(raw) as { media?: QuizQuestionMedia; error?: string };
        } catch {
          payload = { error: `Сервер вернул некорректный ответ (${response.status}).` };
        }
      }

      if (!response.ok) {
        throw new Error(payload.error ?? `Не удалось загрузить медиа (${response.status}).`);
      }
      if (!payload.media) {
        throw new Error("Сервер не вернул параметры медиа.");
      }

      setMedia(payload.media);
    } catch (uploadError) {
      setMediaError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить медиа.");
    } finally {
      setMediaBusy(false);
    }
  }

  function validateForm(event: FormEvent<HTMLFormElement>) {
    setLocalError(null);

    const formData = new FormData(event.currentTarget);
    const prompt = String(formData.get("prompt") ?? "").trim();
    const points = Number.parseInt(String(formData.get("points") ?? ""), 10);

    if (!prompt) {
      event.preventDefault();
      setLocalError("Введите текст вопроса");
      return;
    }

    if (!Number.isFinite(points) || points < 1) {
      event.preventDefault();
      setLocalError("Баллы должны быть положительным числом");
      return;
    }

    if (type === "SINGLE_CHOICE") {
      const normalized = singleOptions.map((option) => option.trim()).filter(Boolean);
      if (normalized.length < 2) {
        event.preventDefault();
        setLocalError("Добавьте минимум два варианта ответа");
        return;
      }
      if (singleOptions.some((option) => !option.trim())) {
        event.preventDefault();
        setLocalError("Заполните текст для каждого варианта ответа");
        return;
      }
      if (singleCorrectIndex < 0 || singleCorrectIndex >= singleOptions.length) {
        event.preventDefault();
        setLocalError("Выберите правильный вариант");
        return;
      }
    }

    if (type === "OPEN") {
      if (openReviewMode === "AUTO" && !sampleAnswer.trim()) {
        event.preventDefault();
        setLocalError("Укажите эталонный ответ для автоматической проверки");
        return;
      }
    }

    if (type === "FILE") {
      const normalizedExtensions = fileExtensions
        .split(/[,\s]+/)
        .map((value) => value.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
      if (normalizedExtensions.length === 0) {
        event.preventDefault();
        setLocalError("Укажите хотя бы один допустимый формат файла");
        return;
      }
      if (!Number.isFinite(fileMaxSizeMb) || fileMaxSizeMb < 1 || fileMaxSizeMb > 200) {
        event.preventDefault();
        setLocalError("Максимальный размер файла должен быть от 1 до 200 МБ");
        return;
      }
    }

    if (type === "MATCHING") {
      if (matchingLeft.length < 2 || matchingRight.length < 2) {
        event.preventDefault();
        setLocalError("Для соответствия нужно минимум по 2 элемента слева и справа");
        return;
      }
      if (matchingLeft.some((value) => !value.trim()) || matchingRight.some((value) => !value.trim())) {
        event.preventDefault();
        setLocalError("Заполните все элементы левой и правой колонок");
        return;
      }
      if (matchingPairs.length !== matchingLeft.length || matchingPairs.some((value) => value < 0)) {
        event.preventDefault();
        setLocalError("Укажите пары соответствий для каждого элемента слева");
      }
    }
  }

  return (
    <form action={action} onSubmit={validateForm} className="space-y-6">
      <input type="hidden" name="questionType" value={type} />
      <input type="hidden" name="questionMedia" value={media ? JSON.stringify(media) : ""} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Вопрос</label>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
              {QUESTION_TYPE_TITLES[type]}
            </span>
            <label className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
              <span>Баллы</span>
              <input
                name="points"
                type="number"
                min={1}
                required
                defaultValue={initialPoints ?? 1}
                className="w-12 border-0 bg-transparent p-0 text-center text-xs font-semibold text-zinc-900 outline-none dark:text-zinc-100"
              />
            </label>
          </div>
        </div>
        <textarea
          name="prompt"
          rows={3}
          required
          defaultValue={initialPrompt ?? ""}
          placeholder="Введите текст вопроса"
          className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm shadow-inner outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800"
        />
        {media ? (
          <div className="space-y-2">
            <QuizQuestionMediaViewer media={media} className="mt-2" />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                disabled={mediaBusy}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                {mediaBusy ? "Загрузка..." : "Заменить медиа"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMedia(null);
                  setMediaError(null);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Удалить медиа
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            disabled={mediaBusy}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {mediaBusy ? "Загрузка..." : "Добавить картинку или видео..."}
          </button>
        )}
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
          className="sr-only"
          onChange={uploadQuestionMedia}
          disabled={mediaBusy}
        />
        {mediaError ? (
          <p className="text-sm text-red-700 dark:text-red-300">{mediaError}</p>
        ) : null}
      </section>

      {type === "SINGLE_CHOICE" && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Варианты ответа</h3>
          <div className="overflow-hidden border-y border-zinc-200 dark:border-zinc-800">
            {singleOptions.map((option, index) => (
              <div
                key={`option-${index}`}
                className="group grid grid-cols-[22px_28px_minmax(0,1fr)_auto] items-center gap-2 border-b border-zinc-100 py-2 last:border-b-0 dark:border-zinc-800"
              >
                <GripVertical className="h-4 w-4 text-zinc-300" aria-hidden="true" />
                <input
                  type="radio"
                  name="single-correct"
                  checked={singleCorrectIndex === index}
                  onChange={() => setSingleCorrectIndex(index)}
                  aria-label={`Сделать вариант ${index + 1} правильным`}
                  className="h-4 w-4 accent-zinc-700"
                />
                <input
                  name="optionValues"
                  value={option}
                  onChange={(event) => updateSingleOption(index, event.target.value)}
                  placeholder={`Вариант ответа ${index + 1}`}
                  className="h-10 w-full border-0 bg-transparent px-1 text-sm outline-none placeholder:text-zinc-400 focus:ring-0"
                />
                <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => moveSingleOption(index, "UP")}
                    disabled={!canMoveSingleOption || index === 0}
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
                    aria-label="Переместить вариант выше"
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSingleOption(index, "DOWN")}
                    disabled={!canMoveSingleOption || index === singleOptions.length - 1}
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
                    aria-label="Переместить вариант ниже"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSingleOption(index)}
                    disabled={singleOptions.length <= 2}
                    className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/30"
                    aria-label="Удалить вариант"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addSingleOption}
              className="flex w-full items-center gap-2 px-12 py-3 text-left text-sm text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Введите вариант ответа...
            </button>
          </div>

          <input type="hidden" name="correctIndex" value={singleCorrectIndex + 1} />
        </section>
      )}

      {type === "OPEN" && (
        <section className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <label className="block text-sm font-medium">Режим проверки</label>
            <select
              name="reviewMode"
              value={openReviewMode}
              onChange={(event) => setOpenReviewMode(event.target.value === "MANUAL" ? "MANUAL" : "AUTO")}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="AUTO">Автоматически по эталону</option>
              <option value="MANUAL">Ручная проверка преподавателем</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Эталонный ответ</label>
            <input
              name="sampleAnswer"
              required={openReviewMode === "AUTO"}
              value={sampleAnswer}
              onChange={(event) => setSampleAnswer(event.target.value)}
              placeholder={
                openReviewMode === "AUTO"
                  ? "Эталонный ответ"
                  : "Необязательно. Можно оставить подсказку для проверяющего"
              }
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-2 text-xs text-zinc-500">
              {openReviewMode === "AUTO"
                ? "Ответ ученика будет сравниваться с эталоном автоматически."
                : "После отправки такой ответ получит статус «На проверке»."}
            </p>
          </div>
        </section>
      )}

      {type === "FILE" && (
        <section className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <label className="block text-sm font-medium">Допустимые форматы</label>
            <input
              name="allowedExtensions"
              value={fileExtensions}
              onChange={(event) => setFileExtensions(event.target.value)}
              placeholder="pdf, docx, txt"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Перечислите расширения через запятую без точки. После отправки ответ будет ждать проверки.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium">Максимальный размер файла, МБ</label>
            <input
              name="maxFileSizeMb"
              type="number"
              min={1}
              max={200}
              value={fileMaxSizeMb}
              onChange={(event) => setFileMaxSizeMb(Number.parseInt(event.target.value, 10) || 1)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        </section>
      )}

      {type === "MATCHING" && (
        <section className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Левая колонка</p>
                <button
                  type="button"
                  onClick={addLeft}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Добавить
                </button>
              </div>
              <div className="space-y-2">
                {matchingLeft.map((value, index) => (
                  <div key={`left-${index}`} className="flex items-center gap-2">
                    <input
                      name="leftValues"
                      value={value}
                      onChange={(event) => updateLeft(index, event.target.value)}
                      placeholder={`Левый элемент ${index + 1}`}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={() => removeLeft(index)}
                      disabled={matchingLeft.length <= 2}
                      className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
                      aria-label="Удалить левый элемент"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Правая колонка</p>
                <button
                  type="button"
                  onClick={addRight}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Добавить
                </button>
              </div>
              <div className="space-y-2">
                {matchingRight.map((value, index) => (
                  <div key={`right-${index}`} className="flex items-center gap-2">
                    <input
                      name="rightValues"
                      value={value}
                      onChange={(event) => updateRight(index, event.target.value)}
                      placeholder={`Правый элемент ${index + 1}`}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={() => removeRight(index)}
                      disabled={matchingRight.length <= 2}
                      className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
                      aria-label="Удалить правый элемент"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Пары соответствия</p>
            <div className="mt-2 space-y-2">
              {matchingLeft.map((leftValue, index) => (
                <div key={`pair-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr]">
                  <input
                    value={leftValue}
                    readOnly
                    className="rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  />
                  <select
                    name="pairValues"
                    value={matchingPairs[index] >= 0 ? String(matchingPairs[index] + 1) : ""}
                    onChange={(event) => updatePair(index, event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="">Выберите соответствие</option>
                    {matchingRight.map((rightValue, rightIndex) => (
                      <option key={`pair-option-${index}-${rightIndex}`} value={rightIndex + 1}>
                        {rightValue || `Элемент ${rightIndex + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {localError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {localError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {submitLabel}
        </button>
        {cancelHref ? (
          <Link
            href={cancelHref}
            className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Отмена
          </Link>
        ) : null}
      </div>
    </form>
  );
}
