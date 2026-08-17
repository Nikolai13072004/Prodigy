"use client";

import { useState } from "react";
import { FileUrlInput } from "@/components/FileUrlInput";

const PRESENTATION_ACCEPT =
  ".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";

type Props = {
  fileUrlName?: string;
  totalSlidesName?: string;
  previewUrlName?: string;
  label?: string;
  initialFileUrl?: string | null;
  initialSlides?: number | null;
  initialPreviewUrl?: string | null;
  onPresentationSourceChange?: (value: {
    fileUrl: string | null;
    sourcePdfUrl: string | null;
    totalSlides: number | null;
  }) => void;
};

export function resolvePresentationSourcePdfUrl(fileUrl: string | null, previewUrl: string | null) {
  if (previewUrl && previewUrl.startsWith("/uploads/") && /\.pdf(\?|#|$)/i.test(previewUrl)) return previewUrl;
  return null;
}

export function PresentationUploadFields({
  fileUrlName = "fileUrl",
  totalSlidesName = "totalSlides",
  previewUrlName,
  label = "Презентация",
  initialFileUrl = null,
  initialSlides = null,
  initialPreviewUrl = null,
  onPresentationSourceChange,
}: Props) {
  const [fileUrl, setFileUrl] = useState(initialFileUrl ?? "");
  const [totalSlides, setTotalSlides] = useState<number | null>(initialSlides);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl);
  const [html5Url, setHtml5Url] = useState<string | null>(null);

  const sourcePdfUrl = resolvePresentationSourcePdfUrl(fileUrl, previewUrl);
  const hasLocalPresentation = Boolean(fileUrl) && /^\/uploads\/.+\.(pdf|pptx)(\?|#|$)/i.test(fileUrl);

  const notifySourceChange = (next: {
    fileUrl: string | null;
    sourcePdfUrl: string | null;
    totalSlides: number | null;
  }) => {
    onPresentationSourceChange?.(next);
  };

  return (
    <div className="space-y-2">
      <FileUrlInput
        name={fileUrlName}
        label={label}
        hint="Поддерживаемые форматы: PDF, PPTX"
        accept={PRESENTATION_ACCEPT}
        initialValue={initialFileUrl}
        onValueChange={(value) => {
          setFileUrl(value);
          setTotalSlides(null);
          setPreviewUrl(null);
          setHtml5Url(null);
          const nextSourcePdfUrl = resolvePresentationSourcePdfUrl(value, null);
          notifySourceChange({ fileUrl: value, sourcePdfUrl: nextSourcePdfUrl, totalSlides: null });
        }}
        onUploadComplete={(result) => {
          const nextFileUrl = result.url;
          const nextPreviewUrl = result.previewUrl;
          const nextSourcePdfUrl = resolvePresentationSourcePdfUrl(nextFileUrl, nextPreviewUrl);

          setFileUrl(nextFileUrl);
          setPreviewUrl(nextPreviewUrl);
          setHtml5Url(result.html5Url);
          setTotalSlides(result.pages);
          notifySourceChange({ fileUrl: nextFileUrl, sourcePdfUrl: nextSourcePdfUrl, totalSlides: result.pages });
        }}
      />
      <input type="hidden" name={totalSlidesName} value={totalSlides ?? ""} />
      {previewUrlName ? <input type="hidden" name={previewUrlName} value={previewUrl ?? ""} /> : null}
      <p className="text-xs text-zinc-500">
        {totalSlides && sourcePdfUrl
          ? `Определено слайдов: ${totalSlides}`
          : totalSlides && hasLocalPresentation
            ? `Сохранено слайдов в базе: ${totalSlides}. PDF для предпросмотра не подтвержден.`
            : totalSlides
              ? `Сохранено слайдов в базе: ${totalSlides}`
              : "Загрузите PDF или PPTX, количество слайдов заполнится автоматически."}
      </p>
      {html5Url ? (
        <p className="text-xs text-zinc-500">HTML5-плеер подготовлен: {html5Url}</p>
      ) : null}
      {sourcePdfUrl ? (
        <p className="text-xs text-zinc-500">PDF для предпросмотра: {sourcePdfUrl}</p>
      ) : null}
      {hasLocalPresentation && !sourcePdfUrl ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          PDF для предпросмотра не найден. Перезагрузите презентацию или загрузите файл сразу в PDF.
        </p>
      ) : null}
    </div>
  );
}
