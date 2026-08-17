"use client";

import { useId, useState } from "react";

type Props = {
  action: (formData: FormData) => Promise<void>;
  learnerName: string;
  courseTitle: string;
  buttonLabel?: string;
  buttonClassName?: string;
  hiddenFields?: Record<string, string | undefined>;
};

export function CourseLearnerUnenrollDialog({
  action,
  learnerName,
  courseTitle,
  buttonLabel = "Отчислить",
  buttonClassName,
  hiddenFields,
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
        className={
          buttonClassName ??
          "rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
        }
      >
        {buttonLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h3 id={dialogTitleId} className="text-lg font-semibold text-zinc-950">
                  Отчислить ученика с курса
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {learnerName} · {courseTitle}
                </p>
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="text-xl leading-none text-zinc-500 hover:text-zinc-700"
              >
                ×
              </button>
            </div>

            <form action={action} className="px-5 py-5">
              {Object.entries(hiddenFields ?? {}).map(([key, value]) =>
                value ? <input key={key} type="hidden" name={key} value={value} /> : null
              )}

              <fieldset>
                <legend className="text-sm font-medium text-zinc-900">Что делать с прогрессом по курсу?</legend>
                <div className="mt-3 space-y-2">
                  <label className="flex items-start gap-3 rounded-xl border border-zinc-200 px-4 py-3">
                    <input
                      type="radio"
                      name={dispositionFieldName}
                      value="keep"
                      checked={progressDisposition === "keep"}
                      onChange={() => setProgressDisposition("keep")}
                      className="mt-1 h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-900">Сохранить прогресс по курсу</span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        Материалы, попытки тестов и отзыв останутся в системе для истории и аудита.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-zinc-200 px-4 py-3">
                    <input
                      type="radio"
                      name={dispositionFieldName}
                      value="delete"
                      checked={progressDisposition === "delete"}
                      onChange={() => setProgressDisposition("delete")}
                      className="mt-1 h-4 w-4 border-zinc-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-900">Удалить прогресс по курсу</span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        Будут очищены просмотры материалов, попытки тестов, лучший результат и отзыв по этому курсу.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <input type="hidden" name="progressDisposition" value={progressDisposition} />

              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                После подтверждения ученик потеряет доступ к контенту курса и может лишиться сертификата.
                {progressDisposition === "delete"
                  ? " Прогресс по этому курсу будет удален без возможности восстановления."
                  : " Прогресс по этому курсу останется в истории и может пригодиться при повторном назначении."}
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-zinc-200 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
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
