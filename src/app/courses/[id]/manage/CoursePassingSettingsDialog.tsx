"use client";

import { useEffect, useMemo, useState } from "react";
import { updateCourseProgressionSettings } from "@/app/actions/course-settings-actions";
import {
  COURSE_COMPLETION_MODE_LABELS,
  COURSE_NAVIGATION_MODE_LABELS,
  COURSE_QUIZ_GATE_MODE_LABELS,
  COURSE_STATUS_FORMAT_LABELS,
  type CourseCompletionMode,
  type CourseNavigationMode,
  type CourseQuizGateMode,
  type CourseStatusFormat,
} from "@/lib/constants";

type PassingSettingsItem = {
  id: string;
  title: string;
  type: string;
  typeLabel: string;
  moduleTitle: string | null;
  isRequired: boolean;
};

type CoursePassingSettingsDialogProps = {
  courseId: string;
  navigationMode: CourseNavigationMode;
  quizGateMode: CourseQuizGateMode;
  completionMode: CourseCompletionMode;
  statusFormat: CourseStatusFormat;
  gradedItemIds: string[];
  items: PassingSettingsItem[];
};

export function CoursePassingSettingsDialog({
  courseId,
  navigationMode,
  quizGateMode,
  completionMode,
  statusFormat,
  gradedItemIds,
  items,
}: CoursePassingSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedCompletionMode, setSelectedCompletionMode] = useState<CourseCompletionMode>(
    completionMode
  );
  const [selectedStatusFormat, setSelectedStatusFormat] = useState<CourseStatusFormat>(statusFormat);
  const [requiredIds, setRequiredIds] = useState(() => new Set(items.filter((item) => item.isRequired).map((item) => item.id)));
  const [scoredIds, setScoredIds] = useState(() => new Set(gradedItemIds));
  const allItemIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const effectiveRequiredIds =
    selectedCompletionMode === "ALL_ITEMS" ? allItemIds : requiredIds;
  const gradableRequiredItems = items.filter(
    (item) => effectiveRequiredIds.has(item.id) && isGradableMaterial(item.type)
  );
  const hasGradableRequiredItems = gradableRequiredItems.length > 0;
  const effectiveStatusFormat = hasGradableRequiredItems ? selectedStatusFormat : "COMPLETED_ONLY";

  function toggleRequired(itemId: string) {
    setRequiredIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function toggleScored(itemId: string) {
    setScoredIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function selectAllRequired() {
    setRequiredIds(new Set(items.map((item) => item.id)));
  }

  function clearRequired() {
    setRequiredIds(new Set());
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Настройки прохождения
      </button>

      {open ? (
        <div className="admin-content-modal fixed z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Закрыть настройки прохождения"
            className="absolute inset-0 bg-zinc-950/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-full w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-zinc-950">Настройки прохождения курса</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть настройки прохождения"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                x
              </button>
            </div>

            <form
              action={updateCourseProgressionSettings.bind(null, courseId)}
              className="max-h-[calc(100vh-180px)] overflow-y-auto px-6 py-5"
            >
              <div className="grid gap-6 md:grid-cols-[170px_1fr]">
                <label className="pt-2 text-sm font-medium text-zinc-700" htmlFor="course-navigation-mode">
                  Порядок просмотра материалов
                </label>
                <div>
                  <select
                    id="course-navigation-mode"
                    name="navigationMode"
                    defaultValue={navigationMode}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                  >
                    {Object.entries(COURSE_NAVIGATION_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-zinc-500">
                    При последовательном порядке учащиеся проходят обязательные материалы по очереди.
                  </p>
                </div>

                <label className="pt-2 text-sm font-medium text-zinc-700" htmlFor="course-quiz-gate-mode">
                  Условие открытия после теста
                </label>
                <div>
                  <select
                    id="course-quiz-gate-mode"
                    name="quizGateMode"
                    defaultValue={quizGateMode}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                  >
                    {Object.entries(COURSE_QUIZ_GATE_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-zinc-500">
                    В строгом режиме следующий этап откроется только после статуса «Пройден».
                  </p>
                </div>

                <label className="pt-2 text-sm font-medium text-zinc-700" htmlFor="course-completion-mode">
                  Условие завершения курса
                </label>
                <div>
                  <select
                    id="course-completion-mode"
                    name="completionMode"
                    value={selectedCompletionMode}
                    onChange={(event) =>
                      setSelectedCompletionMode(event.target.value as CourseCompletionMode)
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                  >
                    {Object.entries(COURSE_COMPLETION_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  {selectedCompletionMode === "REQUIRED_ITEMS" ? (
                    <div className="mt-4 rounded-xl border border-zinc-200">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 text-sm">
                        <span className="font-medium text-zinc-700">
                          Выбрано материалов: {requiredIds.size}
                        </span>
                        <div className="flex gap-3">
                          <button type="button" onClick={selectAllRequired} className="text-emerald-700 hover:underline">
                            Выбрать все
                          </button>
                          <button type="button" onClick={clearRequired} className="text-emerald-700 hover:underline">
                            Очистить
                          </button>
                        </div>
                      </div>
                      <ul className="max-h-56 overflow-y-auto py-2">
                        {items.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 px-4 py-2 text-sm hover:bg-zinc-50">
                            <input
                              type="checkbox"
                              name="requiredItemIds"
                              value={item.id}
                              checked={requiredIds.has(item.id)}
                              onChange={() => toggleRequired(item.id)}
                              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600"
                            />
                            <MaterialSettingsLabel item={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">
                      Все материалы курса будут обязательными для успешного завершения.
                    </p>
                  )}
                </div>

                <label className="pt-2 text-sm font-medium text-zinc-700" htmlFor="course-status-format">
                  Формат статуса курса
                </label>
                <div>
                  {!hasGradableRequiredItems ? (
                    <input type="hidden" name="statusFormat" value="COMPLETED_ONLY" />
                  ) : null}
                  <select
                    id="course-status-format"
                    name="statusFormat"
                    value={effectiveStatusFormat}
                    disabled={!hasGradableRequiredItems}
                    onChange={(event) =>
                      setSelectedStatusFormat(event.target.value as CourseStatusFormat)
                    }
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2 disabled:bg-zinc-100 disabled:text-zinc-400"
                  >
                    {Object.entries(COURSE_STATUS_FORMAT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-zinc-500">
                    {hasGradableRequiredItems
                      ? "Оценивание доступно для обязательных тестов и будущих оцениваемых материалов."
                      : "Среди обязательных материалов нет оцениваемых материалов, поэтому баллы за курс не считаются."}
                  </p>

                  {effectiveStatusFormat === "PASSED_WITH_SCORE" && hasGradableRequiredItems ? (
                    <div className="mt-4 rounded-xl border border-zinc-200">
                      <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700">
                        Материалы, которые учитываются в балле
                      </div>
                      <ul className="py-2">
                        {gradableRequiredItems.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 px-4 py-2 text-sm hover:bg-zinc-50">
                            <input
                              type="checkbox"
                              name="gradedItemIds"
                              value={item.id}
                              checked={scoredIds.has(item.id)}
                              onChange={() => toggleScored(item.id)}
                              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600"
                            />
                            <MaterialSettingsLabel item={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 border-t border-zinc-200 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MaterialSettingsLabel({ item }: { item: PassingSettingsItem }) {
  return (
    <span className="min-w-0">
      <span className="block font-medium text-zinc-900">{item.title}</span>
      <span className="block text-xs text-zinc-500">
        {item.moduleTitle ? `${item.moduleTitle} · ` : ""}
        {item.typeLabel}
      </span>
    </span>
  );
}

function isGradableMaterial(type: string) {
  return type === "QUIZ";
}
