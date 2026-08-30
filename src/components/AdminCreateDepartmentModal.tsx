"use client";

import { useRef, useState } from "react";
import { Button, Label } from "@/components/ui";

type Props = {
  action: (formData: FormData) => Promise<void>;
};

export function AdminCreateDepartmentModal({ action }: Props) {
  const [open, setOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function validateName() {
    const input = nameInputRef.current;
    if (!input) return true;
    const isValid = input.value.trim().length > 0;
    if (!isValid) {
      input.setCustomValidity("Введите название подразделения");
      input.reportValidity();
      return false;
    }
    input.setCustomValidity("");
    return true;
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Новое подразделение</Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-lg bg-[var(--surface-raised)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <h3 className="text-xl font-medium text-[var(--ink)]">Новое подразделение</h3>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="text-xl leading-none text-[var(--ink-muted)] hover:text-[var(--ink)]"
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
              <Label htmlFor="new-department-name" className="mb-2 block">
                Название
              </Label>
              <input
                id="new-department-name"
                name="name"
                required
                autoFocus
                ref={nameInputRef}
                onInput={() => {
                  const input = nameInputRef.current;
                  if (!input) return;
                  if (input.value.trim().length > 0) input.setCustomValidity("");
                }}
                className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
              />

              <div className="mt-8 flex justify-end gap-2 border-t border-[var(--line)] pt-3">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit">Создать</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
