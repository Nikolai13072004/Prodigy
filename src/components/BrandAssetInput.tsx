"use client";

import { useEffect, useId, useState } from "react";
import { Button, buttonStyles, Label } from "@/components/ui";

type Props = {
  accept: string;
  hint: string;
  initialValue: string | null;
  label: string;
  name: string;
  onValueChange?: (value: string) => void;
};

export function BrandAssetInput({ accept, hint, initialValue, label, name, onValueChange }: Props) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue]);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/settings/assets", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Не удалось загрузить файл.");
      }

      setValue(payload.url);
      onValueChange?.(payload.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить файл.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Label htmlFor={inputId} className="block">
            {label}
          </Label>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p>
        </div>

        <div className="flex gap-2">
          <label className={buttonStyles("secondary", "md", "cursor-pointer")}>
            {busy ? "Загрузка..." : "Загрузить"}
            <input
              className="sr-only"
              type="file"
              accept={accept}
              onChange={onFileChange}
              disabled={busy}
            />
          </label>
          <Button
            variant="secondary"
            onClick={() => {
              setValue("");
              onValueChange?.("");
            }}
          >
            Очистить
          </Button>
        </div>
      </div>

      <input id={inputId} type="hidden" name={name} value={value} readOnly />

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-raised)] px-3">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="max-h-16 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-[var(--ink-muted)]">Файл не выбран</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-xs text-[var(--ink-muted)]">
          <div className="truncate">{value || "Будет использован логотип/иконка по умолчанию."}</div>
          {error ? <div className="mt-2 text-sm text-[var(--danger)]">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
