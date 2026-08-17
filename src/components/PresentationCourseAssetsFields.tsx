"use client";

import { useState } from "react";
import { CourseCoverInput } from "@/components/CourseCoverInput";
import {
  PresentationUploadFields,
  resolvePresentationSourcePdfUrl,
} from "@/components/PresentationUploadFields";
import {
  PRESENTATION_VIEW_MODE_LABELS,
  normalizePresentationViewMode,
  type PresentationViewMode,
} from "@/lib/constants";

type Props = {
  initialFileUrl?: string | null;
  initialSlides?: number | null;
  initialPreviewUrl?: string | null;
  initialCoverUrl?: string | null;
  initialPresentationViewMode?: string | null;
};

export function PresentationCourseAssetsFields({
  initialFileUrl = null,
  initialSlides = null,
  initialPreviewUrl = null,
  initialCoverUrl = null,
  initialPresentationViewMode = null,
}: Props) {
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
        previewUrlName="presentationPreviewUrl"
        initialPreviewUrl={initialPreviewUrl}
        onPresentationSourceChange={({ fileUrl, sourcePdfUrl, totalSlides }) => {
          setPresentationFileUrl(fileUrl ?? "");
          setPresentationSourcePdfUrl(sourcePdfUrl);
          setPresentationPages(totalSlides);
        }}
      />
      <CourseCoverInput
        initialValue={initialCoverUrl}
        sourcePdfUrl={presentationSourcePdfUrl}
        sourcePresentationUrl={presentationFileUrl}
        maxSourcePages={presentationPages}
      />
    </div>
  );
}

function PresentationViewModeSelect({ defaultValue }: { defaultValue: PresentationViewMode }) {
  return (
    <label className="block text-sm font-medium text-zinc-900">
      Режим просмотра презентации
      <select
        name="presentationViewMode"
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
      >
        {Object.entries(PRESENTATION_VIEW_MODE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs font-normal text-zinc-500">
        HTML5-плеер работает без внешних сервисов для загруженных PPTX.
      </span>
    </label>
  );
}
