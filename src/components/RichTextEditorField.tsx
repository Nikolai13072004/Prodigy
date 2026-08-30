"use client";

import { useId, useRef, useState } from "react";
import { Label } from "@/components/ui";
import {
  extractRichTextText,
  normalizeRichTextForEditor,
  sanitizeRichTextHtml,
} from "@/lib/rich-text";

type Props = {
  name: string;
  label: string;
  initialValue?: string | null;
  placeholder?: string;
};

type ToolbarButtonProps = {
  label: string;
  onClick: () => void;
};

function ToolbarButton({ label, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
    >
      {label}
    </button>
  );
}

export function RichTextEditorField({
  name,
  label,
  initialValue,
  placeholder = "Введите содержание урока",
}: Props) {
  const inputId = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const initialHtml = normalizeRichTextForEditor(initialValue);
  const [hasText, setHasText] = useState(() => Boolean(extractRichTextText(initialHtml)));

  const syncEditorValue = () => {
    const rawHtml = editorRef.current?.innerHTML ?? "";
    const nextValue = sanitizeRichTextHtml(rawHtml) ?? "<p></p>";
    if (editorRef.current && editorRef.current.innerHTML !== nextValue) {
      editorRef.current.innerHTML = nextValue;
    }
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = nextValue;
    }
    setHasText(Boolean(extractRichTextText(nextValue)));
  };

  const applyCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditorValue();
  };

  const setBlock = (tagName: "p" | "h2" | "h3" | "blockquote") => {
    applyCommand("formatBlock", tagName);
  };

  const addLink = () => {
    const href = window.prompt("Укажите ссылку", "https://");
    if (!href) return;
    applyCommand("createLink", href);
  };

  return (
    <div>
      <Label htmlFor={inputId} className="block">
        {label}
      </Label>
      <input ref={hiddenInputRef} type="hidden" name={name} defaultValue={initialHtml} />
      <div className="mt-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2">
          <ToolbarButton label="Текст" onClick={() => setBlock("p")} />
          <ToolbarButton label="H2" onClick={() => setBlock("h2")} />
          <ToolbarButton label="H3" onClick={() => setBlock("h3")} />
          <ToolbarButton label="Цитата" onClick={() => setBlock("blockquote")} />
          <ToolbarButton label="B" onClick={() => applyCommand("bold")} />
          <ToolbarButton label="I" onClick={() => applyCommand("italic")} />
          <ToolbarButton label="U" onClick={() => applyCommand("underline")} />
          <ToolbarButton label="Маркер" onClick={() => applyCommand("insertUnorderedList")} />
          <ToolbarButton label="Нумерация" onClick={() => applyCommand("insertOrderedList")} />
          <ToolbarButton label="Ссылка" onClick={addLink} />
        </div>

        <div className="relative">
          {!hasText ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 px-4 py-3 text-sm text-[var(--ink-muted)]">
              {placeholder}
            </div>
          ) : null}
          <div
            id={inputId}
            ref={(node) => {
              editorRef.current = node;
              if (node && node.dataset.richTextInitialized !== "1") {
                node.innerHTML = initialHtml;
                node.dataset.richTextInitialized = "1";
              }
            }}
            contentEditable
            suppressContentEditableWarning
            onInput={syncEditorValue}
            onBlur={syncEditorValue}
            className="min-h-40 px-4 py-3 text-sm leading-relaxed text-[var(--ink)] outline-none [&_a]:text-[var(--success)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--line)] [&_blockquote]:pl-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        Базовый WYSIWYG: заголовки, списки, выделение и ссылки. Содержимое сохранится как HTML.
      </p>
    </div>
  );
}
