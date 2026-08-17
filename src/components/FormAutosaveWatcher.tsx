"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  formId: string;
  intervalMs?: number;
  visible?: boolean;
};

export function FormAutosaveWatcher({ formId, intervalMs = 30_000, visible = true }: Props) {
  const [dirty, setDirty] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const markDirty = () => {
      setDirty(true);
    };
    const onSubmit = () => {
      setDirty(false);
      setAutosaving(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setAutosaving(false);
      }, 4_000);
    };

    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", onSubmit);

    const interval = window.setInterval(() => {
      if (!dirty || autosaving) return;
      form.requestSubmit();
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
      form.removeEventListener("submit", onSubmit);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [autosaving, dirty, formId, intervalMs]);

  if (!visible) return null;

  return (
    <p className="text-xs text-zinc-500">
      {autosaving
        ? "Автосохранение..."
        : dirty
          ? "Есть несохраненные изменения. Карточка сохранится автоматически."
          : "Автосохранение каждые 30 секунд."}
    </p>
  );
}
