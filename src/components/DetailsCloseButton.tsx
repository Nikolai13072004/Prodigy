"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

type DetailsCloseButtonProps = {
  label?: string;
  className?: string;
  children?: ReactNode;
};

export function DetailsCloseButton({ label = "Закрыть", className, children }: DetailsCloseButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      onClick={(event) => {
        const details = event.currentTarget.closest("details");
        if (details instanceof HTMLDetailsElement) {
          details.open = false;
        }
      }}
    >
      {children ?? <X className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
