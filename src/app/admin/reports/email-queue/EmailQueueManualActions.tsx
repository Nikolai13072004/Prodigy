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
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-800"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <a
          href={buildOutlookWebHref(props)}
          target="_blank"
          rel="noreferrer"
          aria-label="Открыть письмо в Outlook Web с HTML-оформлением"
          title="Outlook Web с HTML-оформлением"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={copyDraft}
          aria-label={copied ? "Письмо скопировано" : "Скопировать текст письма"}
          title={copied ? "Скопировано" : "Копировать текст"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setShowHtmlPreview(true)}
          aria-label="Открыть HTML письма"
          title="HTML письма"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
        >
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}

      {showHtmlPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Закрыть предпросмотр письма"
            className="absolute inset-0 bg-zinc-950/45"
            onClick={() => setShowHtmlPreview(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative z-10 grid max-h-[calc(100vh-48px)] w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl lg:grid-cols-[minmax(0,1fr)_320px]"
          >
            <div className="bg-zinc-100 p-4">
              <iframe
                title="HTML письма"
                sandbox=""
                srcDoc={props.htmlBody}
                className="h-[720px] w-full rounded-xl border border-zinc-200 bg-white"
              />
            </div>
            <aside className="flex max-h-[calc(100vh-48px)] flex-col gap-4 overflow-y-auto border-t border-zinc-200 p-5 lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-zinc-950">Письмо</h3>
                  <p className="mt-1 text-xs text-zinc-500">{props.toEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHtmlPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Тема</p>
                <p className="mt-1 text-sm font-medium text-zinc-950">{props.subject}</p>
              </div>
              <button
                type="button"
                onClick={copyHtml}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
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
