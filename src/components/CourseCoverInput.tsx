"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, buttonStyles, Label } from "@/components/ui";

type Props = {
  initialValue: string | null;
  label?: string;
  name?: string;
  hint?: string;
  showHint?: boolean;
  assetKind?: "thumbnail" | "cover";
  previewAspectRatio?: string;
  previewClassName?: string;
  variant?: "card" | "plain";
  showLabel?: boolean;
  sourcePdfUrl?: string | null;
  sourcePresentationUrl?: string | null;
  maxSourcePages?: number | null;
  pairedThumbnailName?: string;
  initialPairedThumbnailValue?: string | null;
};

export function CourseCoverInput({
  initialValue,
  label = "Обложка курса",
  name = "coverUrl",
  hint = "Загрузите JPEG/PNG/GIF до 5 МБ или сделайте обложку из страницы презентации.",
  showHint = true,
  assetKind,
  previewAspectRatio = "16 / 9",
  previewClassName = "w-44",
  variant = "card",
  showLabel = true,
  sourcePdfUrl = null,
  sourcePresentationUrl = null,
  maxSourcePages = null,
  pairedThumbnailName,
  initialPairedThumbnailValue = null,
}: Props) {
  const inputId = useId();
  const busyInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue ?? "");
  const [pairedThumbnailValue, setPairedThumbnailValue] = useState(initialPairedThumbnailValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPageInput, setCoverPageInput] = useState("1");
  const [preparedSourcePdfUrl, setPreparedSourcePdfUrl] = useState(sourcePdfUrl);
  const [preparedSourcePages, setPreparedSourcePages] = useState(maxSourcePages);
  const [preferCleanPresentationImage, setPreferCleanPresentationImage] = useState(true);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue]);

  useEffect(() => {
    setPairedThumbnailValue(initialPairedThumbnailValue ?? "");
  }, [initialPairedThumbnailValue]);

  useEffect(() => {
    setCoverPageInput("1");
  }, [sourcePdfUrl, maxSourcePages]);

  useEffect(() => {
    setPreparedSourcePdfUrl(sourcePdfUrl);
    setPreparedSourcePages(maxSourcePages);
  }, [sourcePdfUrl, maxSourcePages]);

  function setUploadBusy(nextBusy: boolean) {
    if (busyInputRef.current) {
      busyInputRef.current.value = nextBusy ? "1" : "0";
    }

    window.dispatchEvent(
      new CustomEvent("course-cover-input:busy", {
        detail: { name, busy: nextBusy },
      })
    );

    setBusy(nextBusy);
  }

  useEffect(() => {
    if (busyInputRef.current) {
      busyInputRef.current.value = busy ? "1" : "0";
    }
  }, [busy]);

  async function preparePresentationSourcePdf() {
    if (preparedSourcePdfUrl) return preparedSourcePdfUrl;
    if (!sourcePresentationUrl) {
      throw new Error("Сначала загрузите презентацию.");
    }

    const response = await fetch("/api/presentation-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: sourcePresentationUrl }),
    });
    const payload = (await response.json()) as { error?: string; previewUrl?: string; pages?: number | null };

    if (!response.ok || !payload.previewUrl) {
      throw new Error(payload.error ?? "Не удалось подготовить презентацию для предпросмотра.");
    }

    setPreparedSourcePdfUrl(payload.previewUrl);
    setPreparedSourcePages(payload.pages ?? null);
    return payload.previewUrl;
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadBusy(true);
    setError(null);
    setGenerationNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (assetKind) formData.append("kind", assetKind);

      const response = await fetch("/api/course-assets", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Не удалось загрузить файл.");
      }

      setValue(payload.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить файл.");
    } finally {
      setUploadBusy(false);
      event.target.value = "";
    }
  }

  async function onGenerateFromPresentation() {
    const parsedPage = Number.parseInt(coverPageInput, 10);
    const maxPage = preparedSourcePages && preparedSourcePages > 0 ? preparedSourcePages : 1000;
    if (!Number.isFinite(parsedPage) || parsedPage < 1 || parsedPage > maxPage) {
      setError(`Укажите номер страницы от 1 до ${maxPage}.`);
      return;
    }

    setUploadBusy(true);
    setError(null);
    setGenerationNotice(null);

    try {
      const currentSourcePdfUrl = await preparePresentationSourcePdf();
      const response = await fetch("/api/course-assets/from-pdf-page", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: currentSourcePdfUrl,
          page: parsedPage,
          clean: preferCleanPresentationImage,
          sourcePresentationUrl,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        url?: string;
        thumbnailUrl?: string;
        cleanUsed?: boolean;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Не удалось сформировать обложку из презентации.");
      }

      setValue(payload.url);
      if (pairedThumbnailName && payload.thumbnailUrl) {
        setPairedThumbnailValue(payload.thumbnailUrl);
      }
      if (preferCleanPresentationImage) {
        setGenerationNotice(
          payload.cleanUsed
            ? "Обложка сделана из чистого кадра без надписей."
            : "Чистый кадр не найден, использован обычный кадр из PDF."
        );
      }
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Не удалось сформировать обложку из презентации."
      );
    } finally {
      setUploadBusy(false);
    }
  }

  const labelBlock =
    showLabel || showHint ? (
      <div>
        {showLabel ? (
          <Label htmlFor={inputId} className="block">
            {label}
          </Label>
        ) : null}
        {showHint ? <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
      </div>
    ) : null;
  const uploadControls = (
    <div className="flex gap-2">
      <label className={buttonStyles("secondary", "md", "cursor-pointer")}>
        {busy ? "Загрузка..." : value ? "Заменить" : "Загрузить"}
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/gif,.png,.jpg,.jpeg,.gif"
          onChange={onFileChange}
          disabled={busy}
        />
      </label>
      <Button
        variant="secondary"
        onClick={() => {
          setValue("");
          setGenerationNotice(null);
          if (pairedThumbnailName) {
            setPairedThumbnailValue("");
          }
        }}
      >
        Очистить
      </Button>
    </div>
  );
  const hasPreparedPresentationSource = Boolean(preparedSourcePdfUrl);
  const hasPresentationSource = Boolean(preparedSourcePdfUrl || sourcePresentationUrl);
  const sourceControls = hasPresentationSource ? (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3">
      <p className="text-xs text-[var(--ink-muted)]">
        {hasPreparedPresentationSource
          ? "Можно автоматически сделать обложку и миниатюру из страницы загруженной презентации."
          : "PDF для предпросмотра еще не подготовлен. Система попробует подготовить его из презентации при нажатии."}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`${inputId}-cover-page`} className="text-sm text-[var(--ink)]">
          Номер страницы
        </label>
        <input
          id={`${inputId}-cover-page`}
          type="number"
          min={1}
          max={preparedSourcePages && preparedSourcePages > 0 ? preparedSourcePages : undefined}
          value={coverPageInput}
          onChange={(event) => setCoverPageInput(event.target.value)}
          className="w-28 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)]"
        />
        <Button
          variant="secondary"
          onClick={onGenerateFromPresentation}
          disabled={busy}
        >
          {busy ? "Подготовка..." : hasPreparedPresentationSource ? "Сделать из страницы" : "Подготовить и сделать"}
        </Button>
        <label className="inline-flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={preferCleanPresentationImage}
            onChange={(event) => setPreferCleanPresentationImage(event.target.checked)}
          />
          Без надписей
        </label>
      </div>
      {hasPreparedPresentationSource && preparedSourcePages && preparedSourcePages > 0 ? (
        <p className="mt-2 text-xs text-[var(--ink-muted)]">Доступно страниц: {preparedSourcePages}</p>
      ) : !hasPreparedPresentationSource && preparedSourcePages && preparedSourcePages > 0 ? (
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Сохранено слайдов в базе: {preparedSourcePages}. Доступность страниц подтвердится после подготовки PDF.
        </p>
      ) : null}
    </div>
  ) : null;
  const previewValue = pairedThumbnailName && pairedThumbnailValue ? pairedThumbnailValue : value;
  const preview = (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-raised)] ${previewClassName}`}
      style={{ aspectRatio: previewAspectRatio }}
    >
      {previewValue ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewValue} alt={label} className="h-full w-full object-cover" />
      ) : (
        <span className="px-3 text-center text-xs text-[var(--ink-muted)]">Изображение не загружено</span>
      )}
    </div>
  );
  const hiddenInput = (
    <>
      <input id={inputId} type="hidden" name={name} value={value} readOnly />
      <input ref={busyInputRef} type="hidden" name={`${name}UploadBusy`} value={busy ? "1" : "0"} readOnly />
      {pairedThumbnailName ? (
        <input type="hidden" name={pairedThumbnailName} value={pairedThumbnailValue} readOnly />
      ) : null}
    </>
  );

  if (variant === "plain") {
    return (
      <div>
        {hiddenInput}
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          {preview}
          <div className="min-w-56 flex-1 space-y-3">
            {labelBlock}
            {uploadControls}
            {sourceControls}
            {error ? <div className="text-sm text-[var(--danger)]">{error}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {labelBlock}
        {uploadControls}
      </div>

      {sourceControls ? <div className="mt-4">{sourceControls}</div> : null}
      {hiddenInput}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {preview}
        {error ? <div className="min-w-0 flex-1 text-sm text-[var(--danger)]">{error}</div> : null}
        {!error && generationNotice ? (
          <div className="min-w-0 flex-1 text-sm text-[var(--ink-muted)]">{generationNotice}</div>
        ) : null}
      </div>
    </div>
  );
}
