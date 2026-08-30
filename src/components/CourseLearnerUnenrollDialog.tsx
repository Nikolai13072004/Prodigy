"use client";

import { useId, useState } from "react";
import { Button, buttonStyles } from "@/components/ui";

type Props = {
  action: (formData: FormData) => Promise<void>;
  learnerName: string;
  courseTitle: string;
  buttonLabel?: string;
  buttonClassName?: string;
  hiddenFields?: Record<string, string | undefined>;
  hasCertificate?: boolean;
};

export function CourseLearnerUnenrollDialog({
  action,
  learnerName,
  courseTitle,
  buttonLabel = "Отчислить",
  buttonClassName,
  hiddenFields,
  hasCertificate = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [progressDisposition, setProgressDisposition] = useState<"keep" | "delete">("keep");
  const dispositionFieldName = useId();
  const dialogTitleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setProgressDisposition("keep");
          setOpen(true);
        }}
        className={buttonClassName ?? buttonStyles("danger")}
      >
        {buttonLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-lg rounded-2xl bg-[var(--surface-raised)] shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <h3 id={dialogTitleId} className="text-lg font-semibold text-[var(--ink)]">
                  Отчислить ученика с курса
                </h3>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {learnerName} · {courseTitle}
                </p>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="text-xl leading-none text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                ×
              </button>
            </div>

            <form action={action} className="px-5 py-5">
              {Object.entries(hiddenFields ?? {}).map(([key, value]) =>
                value ? <input key={key} type="hidden" name={key} value={value} /> : null
              )}

              <fieldset>
                <legend className="text-sm font-medium text-[var(--ink)]">Что делать с прогрессом по курсу?</legend>
                <div className="mt-3 space-y-2">
                  <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
                    <input
                      type="radio"
                      name={dispositionFieldName}
                      value="keep"
                      checked={progressDisposition === "keep"}
                      onChange={() => setProgressDisposition("keep")}
                      className="mt-1 h-4 w-4 border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[var(--ink)]">Сохранить прогресс по курсу</span>
                      <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                        Материалы, попытки тестов и отзыв останутся в системе для истории и аудита.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
                    <input
                      type="radio"
                      name={dispositionFieldName}
                      value="delete"
                      checked={progressDisposition === "delete"}
                      onChange={() => setProgressDisposition("delete")}
                      className="mt-1 h-4 w-4 border-[var(--line)] text-[var(--danger)] focus:ring-[var(--danger)]"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[var(--ink)]">Удалить прогресс по курсу</span>
                      <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                        Будут очищены просмотры материалов, попытки тестов, лучший результат и отзыв по этому курсу.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <input type="hidden" name="progressDisposition" value={progressDisposition} />

              {hasCertificate ? (
                <label className="mt-3 flex items-start gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
                  <input
                    type="checkbox"
                    name="revokeCertificate"
                    value="1"
                    className="mt-1 h-4 w-4 border-[var(--line)] text-[var(--danger)] focus:ring-[var(--danger)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-[var(--ink)]">Аннулировать выданный сертификат</span>
                    <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                      По умолчанию сертификат сохраняется: прохождение курса остаётся фактом. Отметьте, чтобы
                      аннулировать его при отчислении.
                    </span>
                  </span>
                </label>
              ) : null}

              <div className="mt-4 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
                После подтверждения ученик потеряет доступ к контенту курса и может лишиться сертификата.
                {progressDisposition === "delete"
                  ? " Прогресс по этому курсу будет удален без возможности восстановления."
                  : " Прогресс по этому курсу останется в истории и может пригодиться при повторном назначении."}
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Подтвердить отчисление
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
