"use client";

import { useEffect, useState } from "react";

type ToastKind = "success" | "error";

export function BuilderActionToast({ kind, message }: { kind: ToastKind; message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!visible) return null;

  const palette =
    kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 shadow-sm ${palette}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">
            {kind === "success" ? "Действие выполнено" : "Ошибка"}
          </p>
          <p className="mt-1 text-sm">{message}</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded border border-current/30 px-2 py-1 text-xs"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
