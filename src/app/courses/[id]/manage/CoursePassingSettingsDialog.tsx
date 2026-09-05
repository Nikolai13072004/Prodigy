"use client";

import { useEffect, useMemo, useState } from "react";
import { updateCourseProgressionSettings } from "@/app/actions/course-settings-actions";
import { Button, Label, Select } from "@/components/ui";
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
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Настройки прохождения
      </Button>

      {open ? (
        <div className="admin-content-modal fixed z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Закрыть настройки прохождения"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-full w-full max-w-3xl overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Настройки прохождения курса</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть настройки прохождения"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                x
              </button>
            </div>

            <form
              action={updateCourseProgressionSettings.bind(null, courseId)}
              className="max-h-[calc(100vh-180px)] overflow-y-auto px-6 py-5"
            >
              <div className="grid gap-6 md:grid-cols-[170px_1fr]">
                <Label className="pt-2" htmlFor="course-navigation-mode">
                  Порядок просмотра материалов
                </Label>
                <div>
                  <Select
                    id="course-navigation-mode"
                    name="navigationMode"
                    defaultValue={navigationMode}
                  >
                    {Object.entries(COURSE_NAVIGATION_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    При последовательном порядке учащиеся проходят обязательные материалы по очереди.
                  </p>
                </div>

                <Label className="pt-2" htmlFor="course-quiz-gate-mode">
                  Условие открытия после теста
                </Label>
                <div>
                  <Select
                    id="course-quiz-gate-mode"
                    name="quizGateMode"
                    defaultValue={quizGateMode}
                  >
                    {Object.entries(COURSE_QUIZ_GATE_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    В строгом режиме следующий этап откроется только после статуса «Пройден».
                  </p>
                </div>

                <Label className="pt-2" htmlFor="course-completion-mode">
                  Условие завершения курса
                </Label>
                <div>
                  <Select
                    id="course-completion-mode"
                    name="completionMode"
                    value={selectedCompletionMode}
                    onChange={(event) =>
                      setSelectedCompletionMode(event.target.value as CourseCompletionMode)
                    }
                  >
                    {Object.entries(COURSE_COMPLETION_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>

                  {selectedCompletionMode === "REQUIRED_ITEMS" ? (
                    <div className="mt-4 rounded-xl border border-[var(--line)]">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 text-sm">
                        <span className="font-medium text-[var(--ink)]">
                          Выбрано материалов: {requiredIds.size}
                        </span>
                        <div className="flex gap-3">
                          <button type="button" onClick={selectAllRequired} className="text-[var(--accent)] hover:underline">
                            Выбрать все
                          </button>
                          <button type="button" onClick={clearRequired} className="text-[var(--accent)] hover:underline">
                            Очистить
                          </button>
                        </div>
                      </div>
                      <ul className="max-h-56 overflow-y-auto py-2">
                        {items.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 px-4 py-2 text-sm hover:bg-[var(--accent-soft)]">
                            <input
                              type="checkbox"
                              name="requiredItemIds"
                              value={item.id}
                              checked={requiredIds.has(item.id)}
                              onChange={() => toggleRequired(item.id)}
                              className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--accent)]"
                            />
                            <MaterialSettingsLabel item={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                      Все материалы курса будут обязательными для успешного завершения.
                    </p>
                  )}
                </div>

                <Label className="pt-2" htmlFor="course-status-format">
                  Формат статуса курса
                </Label>
                <div>
                  {!hasGradableRequiredItems ? (
                    <input type="hidden" name="statusFormat" value="COMPLETED_ONLY" />
                  ) : null}
                  <Select
                    id="course-status-format"
                    name="statusFormat"
                    value={effectiveStatusFormat}
                    disabled={!hasGradableRequiredItems}
                    onChange={(event) =>
                      setSelectedStatusFormat(event.target.value as CourseStatusFormat)
                    }
                    className="disabled:bg-[var(--surface)] disabled:text-[var(--ink-muted)]"
                  >
                    {Object.entries(COURSE_STATUS_FORMAT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    {hasGradableRequiredItems
                      ? "Оценивание доступно для обязательных тестов и будущих оцениваемых материалов."
                      : "Среди обязательных материалов нет оцениваемых материалов, поэтому баллы за курс не считаются."}
                  </p>

                  {effectiveStatusFormat === "PASSED_WITH_SCORE" && hasGradableRequiredItems ? (
                    <div className="mt-4 rounded-xl border border-[var(--line)]">
                      <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--ink)]">
                        Материалы, которые учитываются в балле
                      </div>
                      <ul className="py-2">
                        {gradableRequiredItems.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 px-4 py-2 text-sm hover:bg-[var(--accent-soft)]">
                            <input
                              type="checkbox"
                              name="gradedItemIds"
                              value={item.id}
                              checked={scoredIds.has(item.id)}
                              onChange={() => toggleScored(item.id)}
                              className="mt-1 h-4 w-4 rounded border-[var(--line)] text-[var(--accent)]"
                            />
                            <MaterialSettingsLabel item={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 border-t border-[var(--line)] pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit">Сохранить</Button>
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
      <span className="block font-medium text-[var(--ink)]">{item.title}</span>
      <span className="block text-xs text-[var(--ink-muted)]">
        {item.moduleTitle ? `${item.moduleTitle} · ` : ""}
        {item.typeLabel}
      </span>
    </span>
  );
}

function isGradableMaterial(type: string) {
  return type === "QUIZ";
}
