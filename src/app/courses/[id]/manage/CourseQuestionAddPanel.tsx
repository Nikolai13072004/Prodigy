"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

type QuestionType = "SINGLE_CHOICE" | "OPEN" | "MATCHING";
type QuestionAction = (formData: FormData) => void | Promise<void>;
type MatchingRow = { left: string; right: string };

type Props = {
  actions: {
    singleChoice: QuestionAction;
    open: QuestionAction;
    matching: QuestionAction;
  };
};

const QUESTION_TYPES: Array<{
  type: QuestionType;
  title: string;
  description: string;
}> = [
  {
    type: "SINGLE_CHOICE",
    title: "Выбор одного ответа",
    description: "Несколько вариантов, правильный только один.",
  },
  {
    type: "OPEN",
    title: "Краткий ответ",
    description: "Ученик вводит текст, система сверяет его с эталоном.",
  },
  {
    type: "MATCHING",
    title: "Соответствие",
    description: "Пары из левой и правой колонок.",
  },
];

function getAction(type: QuestionType, actions: Props["actions"]) {
  if (type === "SINGLE_CHOICE") return actions.singleChoice;
  if (type === "OPEN") return actions.open;
  return actions.matching;
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function validateQuestionForm(type: QuestionType, formData: FormData) {
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) return "Введите текст вопроса.";

  if (type === "SINGLE_CHOICE") {
    const options = splitLines(formData.get("options"));
    const correctIndex = Number.parseInt(String(formData.get("correctIndex") ?? ""), 10);
    if (options.length < 2) return "Добавьте минимум два варианта ответа.";
    if (!Number.isFinite(correctIndex) || correctIndex < 1 || correctIndex > options.length) {
      return "Отметьте заполненный правильный вариант ответа.";
    }
  }

  if (type === "OPEN" && !String(formData.get("sampleAnswer") ?? "").trim()) {
    return "Введите эталонный ответ.";
  }

  if (type === "MATCHING") {
    const left = splitLines(formData.get("left"));
    const right = splitLines(formData.get("right"));
    const pairsRaw = String(formData.get("pairs") ?? "").trim();
    if (left.length < 2 || right.length < 2) {
      return "Для соответствия нужно минимум две заполненные пары.";
    }
    if (!pairsRaw) return "Укажите правильные пары, например: 1:1, 2:2.";
  }

  return null;
}

function getCorrectIndex(options: string[], selectedIndex: number) {
  if (!options[selectedIndex]?.trim()) return 0;
  return options.slice(0, selectedIndex + 1).filter((option) => option.trim()).length;
}

function getFilledMatchingRows(rows: MatchingRow[]) {
  return rows.filter((row) => row.left.trim() && row.right.trim());
}

export function CourseQuestionAddPanel({ actions }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<QuestionType>("SINGLE_CHOICE");
  const [error, setError] = useState<string | null>(null);
  const [singleOptions, setSingleOptions] = useState(["", "", ""]);
  const [correctSingleIndex, setCorrectSingleIndex] = useState(0);
  const [matchingRows, setMatchingRows] = useState<MatchingRow[]>([
    { left: "", right: "" },
    { left: "", right: "" },
  ]);
  const panelId = useId();
  const correctIndex = getCorrectIndex(singleOptions, correctSingleIndex);
  const filledMatchingRows = getFilledMatchingRows(matchingRows);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setError(null);
        setIsOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function openForm() {
    setError(null);
    setIsOpen(true);
  }

  function closeForm() {
    setError(null);
    setIsOpen(false);
  }

  function resetDraft(type: QuestionType = "SINGLE_CHOICE") {
    setSelectedType(type);
    setSingleOptions(["", "", ""]);
    setCorrectSingleIndex(0);
    setMatchingRows([
      { left: "", right: "" },
      { left: "", right: "" },
    ]);
    setError(null);
    setIsOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const validationError = validateQuestionForm(selectedType, formData);
    if (!validationError) return;

    event.preventDefault();
    setError(validationError);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-controls={panelId}
          aria-expanded={isOpen}
          onClick={isOpen ? closeForm : openForm}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {isOpen ? "Скрыть редактор" : "+ Новый вопрос"}
        </button>
        {!isOpen ? (
          <p className="text-sm text-zinc-500">
            Откроется отдельное окно редактора в стиле iSpring: типы слева, вопрос справа.
          </p>
        ) : null}
      </div>

      {isOpen ? (
        <div className="admin-content-modal fixed z-50 p-3 sm:p-5">
          <button
            type="button"
            aria-label="Закрыть окно редактора вопроса"
            className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[2px]"
            onClick={closeForm}
          />

          <section
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Добавить вопрос"
            className="relative mx-auto flex h-[min(920px,calc(100vh-1.5rem))] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl sm:h-[min(920px,calc(100vh-2.5rem))]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-semibold text-zinc-950">Редактор вопроса</p>
                <p className="text-xs text-zinc-500">Окно можно закрыть кнопкой, фоном или клавишей Escape.</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Закрыть
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="border-b border-zinc-200 bg-zinc-50 p-4 lg:border-b-0 lg:border-r">
                <button
                  type="button"
                  onClick={() => resetDraft()}
                  className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-left text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  + Новый вопрос
                </button>

                <div className="mt-4 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-zinc-200">
                  {QUESTION_TYPES.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      aria-pressed={selectedType === item.type}
                      onClick={() => {
                        setSelectedType(item.type);
                        setError(null);
                      }}
                      className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        selectedType === item.type
                          ? "bg-zinc-900 text-white shadow-sm"
                          : "text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      <span className="block font-medium">{item.title}</span>
                      <span
                        className={`mt-1 block text-xs leading-relaxed ${
                          selectedType === item.type ? "text-zinc-200" : "text-zinc-500"
                        }`}
                      >
                        {item.description}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-5 border-t border-zinc-200 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Содержание</p>
                  <div className="mt-3 rounded-xl border-l-4 border-zinc-900 bg-white px-3 py-3 text-sm shadow-sm">
                    <p className="font-medium text-zinc-950">Новый вопрос</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {QUESTION_TYPES.find((item) => item.type === selectedType)?.title}
                    </p>
                  </div>
                </div>
              </aside>

              <div className="min-w-0 bg-white p-5 sm:p-7">
                <form
                  action={getAction(selectedType, actions)}
                  className="space-y-7"
                  noValidate
                  onChange={() => {
                    if (error) setError(null);
                  }}
                  onSubmit={handleSubmit}
                >
                  {selectedType === "SINGLE_CHOICE" ? (
                    <>
                      <input type="hidden" name="options" value={singleOptions.join("\n")} />
                      <input type="hidden" name="correctIndex" value={correctIndex} />
                    </>
                  ) : null}
                  {selectedType === "MATCHING" ? (
                    <>
                      <input type="hidden" name="left" value={filledMatchingRows.map((row) => row.left).join("\n")} />
                      <input type="hidden" name="right" value={filledMatchingRows.map((row) => row.right).join("\n")} />
                      <input
                        type="hidden"
                        name="pairs"
                        value={filledMatchingRows.map((_, index) => `${index + 1}:${index + 1}`).join(", ")}
                      />
                    </>
                  ) : null}

                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">Вопрос</p>
                      <p className="mt-1 text-xs text-zinc-500">Сначала формулировка, затем варианты ответа.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-zinc-600">
                      <span className="sr-only">Тип вопроса</span>
                      <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-zinc-500" />
                      <select
                        value={selectedType}
                        onChange={(event) => {
                          setSelectedType(event.target.value as QuestionType);
                          setError(null);
                        }}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                      >
                        {QUESTION_TYPES.map((item) => (
                          <option key={item.type} value={item.type}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <QuizField label="Текст вопроса" hint="Например: В каком формате нельзя показывать проект клиенту?">
                    <textarea
                      name="prompt"
                      rows={4}
                      placeholder="Введите текст вопроса..."
                      className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none ring-blue-500 focus:ring-2"
                    />
                  </QuizField>

                  <button
                    type="button"
                    disabled
                    className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-400"
                    title="Медиа в вопросах можно добавить следующим этапом"
                  >
                    + Добавить картинку или видео
                  </button>

                  {selectedType === "SINGLE_CHOICE" ? (
                    <SingleChoiceAnswerEditor
                      options={singleOptions}
                      selectedIndex={correctSingleIndex}
                      onAddOption={() => setSingleOptions((options) => [...options, ""])}
                      onRemoveOption={(index) => {
                        setSingleOptions((options) => options.filter((_, optionIndex) => optionIndex !== index));
                        setCorrectSingleIndex((current) => Math.max(0, Math.min(current, singleOptions.length - 2)));
                      }}
                      onSelectCorrect={setCorrectSingleIndex}
                      onUpdateOption={(index, value) => {
                        setSingleOptions((options) =>
                          options.map((option, optionIndex) => (optionIndex === index ? value : option))
                        );
                      }}
                    />
                  ) : null}

                  {selectedType === "OPEN" ? <OpenAnswerEditor /> : null}

                  {selectedType === "MATCHING" ? (
                    <MatchingAnswerEditor
                      rows={matchingRows}
                      onAddRow={() => setMatchingRows((rows) => [...rows, { left: "", right: "" }])}
                      onRemoveRow={(index) =>
                        setMatchingRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                      }
                      onUpdateRow={(index, key, value) => {
                        setMatchingRows((rows) =>
                          rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
                        );
                      }}
                    />
                  ) : null}

                  {error ? (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-end justify-between gap-4 border-t border-zinc-100 pt-5">
                    <label className="block w-32 text-sm font-medium text-zinc-800">
                      Баллы
                      <input
                        name="points"
                        type="number"
                        min={1}
                        defaultValue={1}
                        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={closeForm}
                        className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Добавить вопрос
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SingleChoiceAnswerEditor({
  options,
  selectedIndex,
  onAddOption,
  onRemoveOption,
  onSelectCorrect,
  onUpdateOption,
}: {
  options: string[];
  selectedIndex: number;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
  onSelectCorrect: (index: number) => void;
  onUpdateOption: (index: number, value: string) => void;
}) {
  return (
    <EditorSection
      title="Варианты ответа"
      description="Отметьте radio-кнопкой правильную строку. Новый вариант можно добавить снизу."
    >
      <div className="divide-y divide-zinc-100 border-y border-zinc-100">
        {options.map((option, index) => (
          <div key={index} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-3">
            <input
              type="radio"
              name="correctOption"
              aria-label={`Правильный вариант ${index + 1}`}
              checked={selectedIndex === index}
              onChange={() => onSelectCorrect(index)}
              className="h-4 w-4 accent-zinc-900"
            />
            <input
              value={option}
              onChange={(event) => onUpdateOption(index, event.target.value)}
              placeholder={`Вариант ${index + 1}`}
              className="w-full rounded-lg border border-transparent px-3 py-2 text-sm outline-none ring-blue-500 hover:border-zinc-200 focus:border-zinc-200 focus:ring-2"
            />
            {options.length > 2 ? (
              <button
                type="button"
                onClick={() => onRemoveOption(index)}
                className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
              >
                Удалить
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" onClick={onAddOption} className="mt-3 text-sm font-medium text-blue-700 hover:underline">
        + Добавить вариант ответа
      </button>
    </EditorSection>
  );
}

function OpenAnswerEditor() {
  return (
    <EditorSection title="Эталонный ответ" description="Этот текст используется как правильный ответ для проверки.">
      <input
        name="sampleAnswer"
        placeholder="Например: регистрация обращения"
        className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none ring-blue-500 focus:ring-2"
      />
    </EditorSection>
  );
}

function MatchingAnswerEditor({
  rows,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
}: {
  rows: MatchingRow[];
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onUpdateRow: (index: number, key: keyof MatchingRow, value: string) => void;
}) {
  return (
    <EditorSection
      title="Пары соответствия"
      description="Каждая строка создает пару: левая колонка соответствует правой колонке."
    >
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)_auto] md:items-center">
            <input
              value={row.left}
              onChange={(event) => onUpdateRow(index, "left", event.target.value)}
              placeholder={`Левая колонка ${index + 1}`}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
            <span className="hidden text-center text-sm text-zinc-400 md:block" aria-hidden="true">
              =
            </span>
            <input
              value={row.right}
              onChange={(event) => onUpdateRow(index, "right", event.target.value)}
              placeholder={`Правая колонка ${index + 1}`}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
            {rows.length > 2 ? (
              <button
                type="button"
                onClick={() => onRemoveRow(index)}
                className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
              >
                Удалить
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" onClick={onAddRow} className="mt-3 text-sm font-medium text-blue-700 hover:underline">
        + Добавить пару
      </button>
    </EditorSection>
  );
}

function EditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 border-b border-zinc-100 pb-2">
        <h5 className="text-base font-semibold text-zinc-950">{title}</h5>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function QuizField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-zinc-800">{label}</span>
      <span className="mb-1 mt-0.5 block text-xs leading-relaxed text-zinc-500">{hint}</span>
      {children}
    </label>
  );
}
