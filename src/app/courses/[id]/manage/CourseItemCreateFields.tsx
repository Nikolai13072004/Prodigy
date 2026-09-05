"use client";

import { useState } from "react";
import { CourseCoverInput } from "@/components/CourseCoverInput";
import { FileUrlInput } from "@/components/FileUrlInput";
import {
  PresentationUploadFields,
  resolvePresentationSourcePdfUrl,
} from "@/components/PresentationUploadFields";
import { RichTextEditorField } from "@/components/RichTextEditorField";
import { Select } from "@/components/ui";
import {
  PRESENTATION_VIEW_MODE_LABELS,
  normalizePresentationViewMode,
  type PresentationViewMode,
} from "@/lib/constants";

export type CourseItemType = "TEXT" | "VIDEO" | "PDF" | "QUIZ" | "SURVEY";

const DEFAULT_TYPE_OPTIONS: CourseItemType[] = ["TEXT", "VIDEO", "PDF", "QUIZ", "SURVEY"];
const DEFAULT_TYPE_LABELS: Record<CourseItemType, string> = {
  TEXT: "Текст",
  VIDEO: "Видео",
  PDF: "Презентация PDF/PPTX",
  QUIZ: "Тест",
  SURVEY: "Опрос",
};

const VIDEO_ACCEPT = ".mp4,.webm,video/mp4,video/webm";

type CourseItemCreateFieldsProps = {
  allowedTypes?: CourseItemType[];
  initialType?: CourseItemType;
  typeLabels?: Partial<Record<CourseItemType, string>>;
  showTypeSelect?: boolean;
};

export function CourseItemCreateFields({
  allowedTypes = DEFAULT_TYPE_OPTIONS,
  initialType,
  typeLabels = {},
  showTypeSelect = true,
}: CourseItemCreateFieldsProps) {
  const typeOptions = allowedTypes.length ? allowedTypes : DEFAULT_TYPE_OPTIONS;
  const fallbackType = initialType && typeOptions.includes(initialType) ? initialType : typeOptions[0];
  const [type, setType] = useState<CourseItemType>(fallbackType);

  const isText = type === "TEXT";
  const isPresentation = type === "PDF";
  const isVideo = type === "VIDEO";
  const isQuiz = type === "QUIZ";
  const isSurvey = type === "SURVEY";

  function handleTypeChange(nextType: CourseItemType) {
    setType(nextType);
  }

  return (
    <>
      <div className={`grid gap-3 ${showTypeSelect ? "md:grid-cols-2" : ""}`}>
        {showTypeSelect ? (
          <Select
            name="type"
            value={type}
            onChange={(event) => handleTypeChange(event.target.value as CourseItemType)}
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {typeLabels[option] ?? DEFAULT_TYPE_LABELS[option]}
              </option>
            ))}
          </Select>
        ) : (
          <input type="hidden" name="type" value={type} readOnly />
        )}
        <Select name="isRequired" defaultValue="1">
          <option value="1">Обязательный материал</option>
          <option value="0">Необязательный материал</option>
        </Select>
      </div>

      {isText ? (
        <RichTextEditorField
          name="content"
          label="Содержание страницы"
          placeholder="Добавьте структуру, подзаголовки, списки и ключевые тезисы"
        />
      ) : null}

      {isPresentation ? (
        <CourseItemPresentationFields />
      ) : null}

      {isVideo ? (
        <FileUrlInput
          label="Видео"
          hint="Поддерживаемые форматы: MP4, WebM"
          accept={VIDEO_ACCEPT}
        />
      ) : null}

      {isQuiz ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-medium text-[var(--ink-muted)]">
            Количество попыток
            <input
              name="maxAttempts"
              type="number"
              min={1}
              defaultValue={2}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--ink-muted)]">
            Минимум правильных ответов
            <input
              name="minCorrectAnswers"
              type="number"
              min={1}
              defaultValue={1}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
            />
          </label>
        </div>
      ) : null}

      {isSurvey ? (
        <div className="rounded-xl border border-[var(--info)] bg-[var(--info-soft)] px-4 py-3 text-sm text-[var(--info)]">
          После добавления откроется конструктор опроса. В нем можно настроить титульный лист,
          вопросы и варианты ответов.
        </div>
      ) : null}
    </>
  );
}

type CourseItemPresentationFieldsProps = {
  initialFileUrl?: string | null;
  initialSlides?: number | null;
  initialCoverUrl?: string | null;
  initialThumbnailUrl?: string | null;
  initialPreviewUrl?: string | null;
  initialPresentationViewMode?: string | null;
  coverInputName?: string;
  thumbnailInputName?: string;
};

export function CourseItemPresentationFields({
  initialFileUrl = null,
  initialSlides = null,
  initialCoverUrl = null,
  initialThumbnailUrl = null,
  initialPreviewUrl = null,
  initialPresentationViewMode = null,
  coverInputName,
  thumbnailInputName,
}: CourseItemPresentationFieldsProps) {
  const [presentationFileUrl, setPresentationFileUrl] = useState(initialFileUrl ?? "");
  const [presentationSourcePdfUrl, setPresentationSourcePdfUrl] = useState<string | null>(
    resolvePresentationSourcePdfUrl(initialFileUrl, initialPreviewUrl)
  );
  const [presentationPages, setPresentationPages] = useState<number | null>(initialSlides);
  const presentationViewMode = normalizePresentationViewMode(initialPresentationViewMode);

  return (
    <div className="space-y-4">
      <PresentationViewModeSelect defaultValue={presentationViewMode} />
      <PresentationUploadFields
        initialFileUrl={initialFileUrl}
        initialSlides={initialSlides}
        initialPreviewUrl={initialPreviewUrl}
        onPresentationSourceChange={({ fileUrl, sourcePdfUrl, totalSlides }) => {
          setPresentationFileUrl(fileUrl ?? "");
          setPresentationSourcePdfUrl(sourcePdfUrl);
          setPresentationPages(totalSlides);
        }}
      />
      {coverInputName ? (
        <CourseCoverInput
          initialValue={initialCoverUrl}
          label="Обложка курса из этой презентации"
          name={coverInputName}
          sourcePdfUrl={presentationSourcePdfUrl}
          sourcePresentationUrl={presentationFileUrl}
          maxSourcePages={presentationPages}
          pairedThumbnailName={thumbnailInputName}
          initialPairedThumbnailValue={initialThumbnailUrl}
        />
      ) : null}
    </div>
  );
}

function PresentationViewModeSelect({ defaultValue }: { defaultValue: PresentationViewMode }) {
  return (
    <label className="block text-xs font-medium text-[var(--ink-muted)]">
      Режим просмотра презентации
      <Select
        name="presentationViewMode"
        defaultValue={defaultValue}
        className="mt-1"
      >
        {Object.entries(PRESENTATION_VIEW_MODE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <span className="mt-1 block text-xs font-normal text-[var(--ink-muted)]">
        HTML5-плеер работает без внешних сервисов для загруженных PPTX.
      </span>
    </label>
  );
}
