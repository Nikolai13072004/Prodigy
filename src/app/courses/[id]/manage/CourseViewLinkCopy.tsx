"use client";

import { useState } from "react";

import { Button, Input } from "@/components/ui";

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
      <Input
        value={href}
        readOnly
        aria-label="Ссылка на просмотр курса"
        className="min-w-0 flex-1"
      />
      <Button type="button" onClick={copyLink}>
        {copied ? "Скопировано" : "Копировать"}
      </Button>
    </div>
  );
}
