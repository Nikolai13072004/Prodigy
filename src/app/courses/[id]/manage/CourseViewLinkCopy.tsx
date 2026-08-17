"use client";

import { useState } from "react";

type CourseViewLinkCopyProps = {
  href: string;
};

export function CourseViewLinkCopy({ href }: CourseViewLinkCopyProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        value={href}
        readOnly
        aria-label="Ссылка на просмотр курса"
        className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 outline-none"
      />
      <button
        type="button"
        onClick={copyLink}
        className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
