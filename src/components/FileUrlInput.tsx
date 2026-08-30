"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Input, Label, buttonStyles } from "@/components/ui";

export type UploadedFileResult = {
  url: string;
  previewUrl: string | null;
  pages: number | null;
  html5Url: string | null;
};

type Props = {
  name?: string;
  label?: string;
  hint?: string;
  accept?: string;
  initialValue?: string | null;
  onValueChange?: (value: string) => void;
  onUploadComplete?: (result: UploadedFileResult) => void;
};

type UploadProcessingKind = "pptx" | "pdf" | "video" | "file";

function getUploadProcessingKind(file: File): UploadProcessingKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pptx") || file.type.includes("presentation")) return "pptx";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("video/") || /\.(mp4|webm)$/i.test(name)) return "video";
  return "file";
}

function getProcessingStatus(kind: UploadProcessingKind, elapsedSeconds: number) {
  if (kind === "pptx") {
    if (elapsedSeconds < 4) return "Файл передан. Конвертируем PPTX в PDF...";
    if (elapsedSeconds < 10) return "Определяем количество слайдов...";
    if (elapsedSeconds < 20) return "Готовим HTML5-плеер...";
    if (elapsedSeconds < 40) return "Собираем слайды и элементы анимации...";
    if (elapsedSeconds < 70) return "Проверяем предпросмотр презентации...";
    return "Обрабатываем большую презентацию, это может занять еще немного времени...";
  }

  if (kind === "pdf") {
    if (elapsedSeconds < 4) return "Файл передан. Проверяем PDF...";
    return "Определяем количество страниц...";
  }

  if (kind === "video") {
    return "Файл передан. Сохраняем видео...";
  }

  return "Файл передан. Обрабатываем...";
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function FileUrlInput({
  name = "fileUrl",
  label = "Ссылка или файл",
  hint = "Поддерживаемые форматы: PDF, PPTX, MP4, WebM",
  accept = ".pdf,.pptx,.mp4,.webm,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,video/mp4,video/webm",
  initialValue = null,
  onValueChange,
  onUploadComplete,
}: Props) {
  const [url, setUrl] = useState(initialValue ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [processingKind, setProcessingKind] = useState<UploadProcessingKind | null>(null);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [processingElapsedSeconds, setProcessingElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!busy || uploadProgress !== 100 || !processingKind || processingStartedAt === null) return;

    const updateProcessingStatus = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - processingStartedAt) / 1000));
      setProcessingElapsedSeconds(elapsedSeconds);
      setUploadStatus(getProcessingStatus(processingKind, elapsedSeconds));
    };

    updateProcessingStatus();
    const intervalId = window.setInterval(updateProcessingStatus, 1000);
    return () => window.clearInterval(intervalId);
  }, [busy, processingKind, processingStartedAt, uploadProgress]);

  function updateUrl(nextUrl: string) {
    setUrl(nextUrl);
    onValueChange?.(nextUrl);
  }

  function uploadFile(file: File) {
    return new Promise<UploadedFileResult>((resolve, reject) => {
      const kind = getUploadProcessingKind(file);
      const fd = new FormData();
      fd.append("file", file);

      const request = new XMLHttpRequest();
      request.open("POST", "/api/upload");

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) {
          setUploadProgress(null);
          setUploadStatus("Передаем файл на сервер...");
          return;
        }

        const nextProgress = Math.min(100, Math.max(1, Math.round((event.loaded / event.total) * 100)));
        setUploadProgress(nextProgress);
        setUploadStatus(nextProgress >= 100 ? "Файл передан, обрабатываем..." : "Передаем файл на сервер...");
      };
      request.upload.onload = () => {
        const startedAt = Date.now();
        setUploadProgress(100);
        setProcessingKind(kind);
        setProcessingStartedAt(startedAt);
        setProcessingElapsedSeconds(0);
        setUploadStatus(getProcessingStatus(kind, 0));
      };

      request.onerror = () => reject(new Error("Не удалось загрузить файл. Проверьте соединение и попробуйте еще раз."));
      request.onabort = () => reject(new Error("Загрузка файла отменена."));
      request.onload = () => {
        const raw = request.responseText;
        let payload: Partial<UploadedFileResult> & { error?: string } = {};

        if (raw) {
          try {
            payload = JSON.parse(raw) as Partial<UploadedFileResult> & { error?: string };
          } catch {
            reject(
              new Error(
                `Сервер вернул некорректный ответ (${request.status}). Попробуйте загрузить файл еще раз.`
              )
            );
            return;
          }
        }

        if (request.status < 200 || request.status >= 300) {
          reject(
            new Error(
              payload.error ??
                `Ошибка загрузки (${request.status}). Поддерживаются форматы PDF, PPTX, MP4 и WebM.`
            )
          );
          return;
        }

        if (!payload.url) {
          reject(new Error("Файл загружен, но сервер не вернул ссылку"));
          return;
        }

        resolve({
          url: payload.url,
          previewUrl: payload.previewUrl ?? null,
          pages: typeof payload.pages === "number" ? payload.pages : null,
          html5Url: typeof payload.html5Url === "string" ? payload.html5Url : null,
        });
      };

      setUploadProgress(0);
      setUploadStatus("Готовим файл к загрузке...");
      request.send(fd);
    });
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setBusy(true);
    setUploadProgress(0);
    setUploadStatus("Готовим файл к загрузке...");
    setProcessingKind(getUploadProcessingKind(f));
    setProcessingStartedAt(null);
    setProcessingElapsedSeconds(0);
    try {
      const result = await uploadFile(f);
      updateUrl(result.url);
      onUploadComplete?.(result);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
      setUploadProgress(null);
      setUploadStatus(null);
      setProcessingKind(null);
      setProcessingStartedAt(null);
      setProcessingElapsedSeconds(0);
      e.target.value = "";
    }
  }

  const progressValue = uploadProgress ?? 0;
  const progressText =
    uploadProgress === 100 && processingStartedAt !== null
      ? `обработка ${formatElapsedTime(processingElapsedSeconds)}`
      : uploadProgress !== null
        ? `${uploadProgress}%`
        : "...";
  const buttonText = busy
    ? uploadProgress !== null && uploadProgress > 0 && uploadProgress < 100
      ? `${uploadProgress}%`
      : uploadProgress === 100
        ? "Обработка..."
        : "Загрузка..."
    : "Выбрать файл";

  return (
    <div className="space-y-2">
      <Label className="block">{label}</Label>
      <p className="text-xs text-[var(--ink-muted)]">{hint}</p>
      <input type="hidden" name={name} value={url} readOnly />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="text"
          value={url}
          onChange={(e) => updateUrl(e.target.value)}
          placeholder="https://… или загрузите файл"
        />
        <label className={buttonStyles("secondary", "md", "cursor-pointer")}>
          {buttonText}
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={onFile}
            disabled={busy}
          />
        </label>
      </div>
      {busy ? (
        <div
          className="rounded-lg border border-[var(--info-soft)] bg-[var(--info-soft)] px-3 py-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploadProgress ?? undefined}
          aria-label="Прогресс загрузки файла"
        >
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--info)]">
            <span>{uploadStatus ?? "Загружаем файл..."}</span>
            <span className="shrink-0 tabular-nums">{progressText}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
            <div
              className="h-full rounded-full bg-[var(--info)] transition-[width] duration-200"
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>
      ) : null}
      {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
    </div>
  );
}
