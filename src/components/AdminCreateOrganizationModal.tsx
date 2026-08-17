"use client";

import { useRef, useState } from "react";

type Props = {
  action: (formData: FormData) => Promise<void>;
};

export function AdminCreateOrganizationModal({ action }: Props) {
  const [open, setOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function validateName() {
    const input = nameInputRef.current;
    if (!input) return true;
    const isValid = input.value.trim().length > 0;
    if (!isValid) {
      input.setCustomValidity("Введите название организации");
      input.reportValidity();
      return false;
    }
    input.setCustomValidity("");
    return true;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-[#2dbf6e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#27a860]"
      >
        Новая организация
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <h3 className="text-xl font-medium text-zinc-800 dark:text-zinc-100">Новая организация</h3>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="text-xl leading-none text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                ×
              </button>
            </div>

            <form
              action={action}
              className="px-5 py-6"
              onSubmit={(event) => {
                if (!validateName()) event.preventDefault();
              }}
            >
              <label htmlFor="new-organization-name" className="mb-2 block text-sm text-zinc-600 dark:text-zinc-300">
                Название
              </label>
              <input
                id="new-organization-name"
                name="name"
                required
                autoFocus
                ref={nameInputRef}
                onInput={() => {
                  const input = nameInputRef.current;
                  if (!input) return;
                  if (input.value.trim().length > 0) input.setCustomValidity("");
                }}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />

              <div className="mt-8 flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#2dbf6e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#27a860]"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
