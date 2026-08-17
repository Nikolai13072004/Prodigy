"use client";

import { useEffect, useState } from "react";

type BusyEvent = CustomEvent<{ name?: string; busy?: boolean }>;

export function CourseSurveySaveActions() {
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    function onBusyChange(event: Event) {
      const detail = (event as BusyEvent).detail;
      if (detail?.name === "introImageUrl") {
        setImageUploading(Boolean(detail.busy));
      }
    }

    window.addEventListener("course-cover-input:busy", onBusyChange);
    return () => window.removeEventListener("course-cover-input:busy", onBusyChange);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      {imageUploading ? (
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Загружается изображение...
        </span>
      ) : null}
      <button
        type="submit"
        name="saveAsReusableTemplate"
        value="1"
        disabled={imageUploading}
        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Сохранить как шаблон
      </button>
      <button
        type="submit"
        disabled={imageUploading}
        className="rounded-md bg-[#0b2446] px-4 py-2 text-sm font-medium text-white hover:bg-[#153565] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Сохранить опрос
      </button>
    </div>
  );
}
