"use client";

import { Camera, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

type Props = {
  userId: string;
  initialValue: string | null;
  displayName: string;
  initials: string;
  name?: string;
  disabled?: boolean;
  formId?: string;
  statusDotClass?: string;
  variant?: "panel" | "header";
};

export function UserAvatarInput({
  userId,
  initialValue,
  displayName,
  initials,
  name = "avatarUrl",
  disabled = false,
  formId,
  statusDotClass,
  variant = "panel",
}: Props) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue]);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || disabled) return;

    setBusy(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("file", file);

      const response = await fetch("/api/user-avatar", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        url?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Не удалось загрузить аватар.");
      }

      setValue(payload.url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не удалось загрузить аватар.",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  const hiddenInput = (
    <input type="hidden" name={name} value={value} readOnly form={formId} />
  );

  if (variant === "header") {
    return (
      <div className="flex w-24 shrink-0 flex-col items-center gap-2">
        {hiddenInput}
        <div className="relative">
          <label
            className={`group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-sky-50 text-2xl font-semibold text-[#0f315d] shadow-inner dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100 ${
              disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            }`}
            title={
              disabled
                ? "Аватар архивированного пользователя нельзя менять"
                : "Загрузить аватар"
            }
            aria-label="Загрузить аватар пользователя"
          >
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
            {!disabled ? (
              <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/0 text-white opacity-0 transition group-hover:bg-zinc-950/35 group-hover:opacity-100">
                <Camera className="h-5 w-5" aria-hidden="true" />
              </span>
            ) : null}
            {statusDotClass ? (
              <span
                className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white dark:border-zinc-900 ${statusDotClass}`}
              />
            ) : null}
            <input
              id={inputId}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
              onChange={onFileChange}
              disabled={busy || disabled}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setValue("");
              setError(null);
            }}
            disabled={busy || disabled || !value}
            title="Убрать аватар"
            aria-label="Убрать аватар"
            className="absolute -bottom-1 -left-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-50 hover:text-red-600 disabled:hidden dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {busy ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Загрузка...
          </span>
        ) : null}
        {error ? (
          <p className="max-w-28 text-center text-xs text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-950/30">
      {hiddenInput}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-sky-50 text-2xl font-semibold text-[#0f315d] shadow-inner dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        <div className="min-w-60 flex-1">
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Аватар пользователя
          </label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Загрузите PNG, JPG, WebP или GIF до 5 МБ. Изображение будет обрезано
            в квадрат.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800">
              <Camera className="h-4 w-4" aria-hidden="true" />
              {busy ? "Загрузка..." : value ? "Заменить" : "Загрузить"}
              <input
                id={inputId}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                onChange={onFileChange}
                disabled={busy || disabled}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setValue("");
                setError(null);
              }}
              disabled={busy || disabled || !value}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-55 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Убрать
            </button>
          </div>
          {error ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
