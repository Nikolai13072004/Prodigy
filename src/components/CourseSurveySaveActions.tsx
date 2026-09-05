"use client";

import { useEffect, useState } from "react";
import { Badge, Button } from "@/components/ui";

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
      {imageUploading ? <Badge tone="warning">Загружается изображение...</Badge> : null}
      <Button
        type="submit"
        variant="secondary"
        name="saveAsReusableTemplate"
        value="1"
        disabled={imageUploading}
      >
        Сохранить как шаблон
      </Button>
      <Button type="submit" disabled={imageUploading}>
        Сохранить опрос
      </Button>
    </div>
  );
}
