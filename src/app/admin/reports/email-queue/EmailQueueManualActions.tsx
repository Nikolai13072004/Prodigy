"use client";

import { useState } from "react";
import { Code2, Copy, ExternalLink, Mail, X } from "lucide-react";

type Props = {
  body: string;
  htmlBody: string;
  subject: string;
  toEmail: string;
};

function buildMailtoHref({ body, subject, toEmail }: Props) {
  return `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildOutlookWebHref({ htmlBody, subject, toEmail }: Props) {
  const url = new URL("https://outlook.office.com/mail/deeplink/compose");
  url.searchParams.set("to", toEmail);
  url.searchParams.set("subject", subject);
  url.searchParams.set("body", htmlBody);
  return url.toString();
}

function formatDraft({ body, subject, toEmail }: Props) {
  return `Кому: ${toEmail}\nТема: ${subject}\n\n${body}`;
}

export function EmailQueueManualActions(props: Props) {
  const [copied, setCopied] = useState(false);
  const [htmlCopied, setHtmlCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(formatDraft(props));
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Не удалось скопировать.");
    }
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(props.htmlBody);
      setHtmlCopied(true);
      setError(null);
      window.setTimeout(() => setHtmlCopied(false), 1800);
    } catch {
      setError("Не удалось скопировать HTML.");
    }
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <a
          href={buildMailtoHref(props)}
          aria-label="Открыть письмо в локальном почтовом клиенте"
          title="Локальный почтовый клиент"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <a
          href={buildOutlookWebHref(props)}
          target="_blank"
          rel="noreferrer"
          aria-label="Открыть письмо в Outlook Web с HTML-оформлением"
          title="Outlook Web с HTML-оформлением"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={copyDraft}
          aria-label={copied ? "Письмо скопировано" : "Скопировать текст письма"}
          title={copied ? "Скопировано" : "Копировать текст"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setShowHtmlPreview(true)}
          aria-label="Открыть HTML письма"
          title="HTML письма"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
        >
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}

      {showHtmlPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Закрыть предпросмотр письма"
            className="absolute inset-0 bg-black/45"
            onClick={() => setShowHtmlPreview(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative z-10 grid max-h-[calc(100vh-48px)] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-xl lg:grid-cols-[minmax(0,1fr)_320px]"
          >
            <div className="bg-[var(--surface)] p-4">
              <iframe
                title="HTML письма"
                sandbox=""
                srcDoc={props.htmlBody}
                className="h-[720px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]"
              />
            </div>
            <aside className="flex max-h-[calc(100vh-48px)] flex-col gap-4 overflow-y-auto border-t border-[var(--line)] p-5 lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--ink)]">Письмо</h3>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">{props.toEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHtmlPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--accent-soft)]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Тема</p>
                <p className="mt-1 text-sm font-medium text-[var(--ink)]">{props.subject}</p>
              </div>
              <button
                type="button"
                onClick={copyHtml}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                {htmlCopied ? "HTML скопирован" : "Скопировать HTML"}
              </button>
            </aside>
          </section>
        </div>
      ) : null}
    </>
  );
}
