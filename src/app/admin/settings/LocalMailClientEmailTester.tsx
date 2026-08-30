"use client";

import { useState } from "react";
import { Copy, ExternalLink, Mail } from "lucide-react";
import { Input, Label, Select } from "@/components/ui";
import { formatHoursLabel } from "@/lib/email/template-format";
import type { PlatformHtmlEmailTemplate } from "@/lib/email/template-settings";

const TEMPLATE_OPTIONS = [
  { key: "welcome", label: "Активация аккаунта", prefix: "welcome" },
  { key: "passwordReset", label: "Сброс пароля", prefix: "passwordReset" },
  { key: "courseAssigned", label: "Назначение курса", prefix: "courseAssigned" },
  { key: "certificate", label: "Сертификат курса", prefix: "certificate" },
] as const;

type TemplateKey = (typeof TEMPLATE_OPTIONS)[number]["key"];

type Props = {
  defaultRecipient: string;
  linkTtlHours: number;
  siteName: string;
  templates: Record<TemplateKey, PlatformHtmlEmailTemplate>;
};

type EmailDraft = {
  body: string;
  recipient: string;
  subject: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readHtmlField(prefix: string, field: keyof PlatformHtmlEmailTemplate, fallback: string) {
  const element = document.getElementById(`${prefix}${field[0].toUpperCase()}${field.slice(1)}`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;

  if (!element) return fallback;

  return element.value.trim() || fallback;
}

function buildSampleVariables(origin: string, linkTtlHours: number) {
  return {
    accessDeadline: "Срок выполнения для курса 9 апреля 2024 г. в 23:30 (GMT+3:00) Москва.",
    accessUrl: `${origin}/activate/test-token`,
    activationUrl: `${origin}/activate/test-token`,
    certificateUrl: `${origin}/certificates/test-certificate`,
    courseTitle: "Инструкции по работе в системе ITSM",
    courseUrl: `${origin}/courses/test-course`,
    firstName: "Тестовый",
    linkTtlHours: String(linkTtlHours),
    linkTtlHoursLabel: formatHoursLabel(linkTtlHours),
    login: "test.user",
    loginUrl: `${origin}/login`,
    passwordInstruction: "Test-1234",
    temporaryPassword: "Test-1234",
    fullName: "Тестовый Пользователь",
    userName: "Тестовый",
  };
}

function replaceTemplateVariables(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
}

function buildMailtoHref(draft: EmailDraft) {
  return `mailto:${encodeURIComponent(draft.recipient)}?subject=${encodeURIComponent(
    draft.subject
  )}&body=${encodeURIComponent(draft.body)}`;
}

function buildOutlookWebHref(draft: EmailDraft) {
  const url = new URL("https://outlook.office.com/mail/deeplink/compose");
  url.searchParams.set("to", draft.recipient);
  url.searchParams.set("subject", draft.subject);
  url.searchParams.set("body", draft.body);
  return url.toString();
}

export function LocalMailClientEmailTester({ defaultRecipient, linkTtlHours, siteName, templates }: Props) {
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function createDraft() {
    const target = recipient.trim();

    if (!target) {
      setError("Укажите email получателя.");
      return null;
    }

    if (!isValidEmail(target)) {
      setError("Укажите корректный email получателя.");
      return null;
    }

    const option = TEMPLATE_OPTIONS.find((item) => item.key === templateKey) ?? TEMPLATE_OPTIONS[0];
    const fallback = templates[option.key];
    const subjectTemplate = readHtmlField(option.prefix, "subject", fallback.subject);
    const textTemplate = readHtmlField(option.prefix, "text", fallback.text);
    const variables = buildSampleVariables(window.location.origin, linkTtlHours);
    const subject = replaceTemplateVariables(subjectTemplate, variables);
    const body = [
      replaceTemplateVariables(textTemplate, variables),
      "",
      `Тестовое письмо из ${siteName}. SMTP при этой проверке не используется.`,
    ].join("\n");

    setError(null);
    return { body, recipient: target, subject };
  }

  function openLocalMailClient() {
    const draft = createDraft();
    if (!draft) return;

    setCopied(false);
    window.location.href = buildMailtoHref(draft);
  }

  function openOutlookWeb() {
    const draft = createDraft();
    if (!draft) return;

    setCopied(false);
    window.open(buildOutlookWebHref(draft), "_blank", "noopener,noreferrer");
  }

  async function copyDraft() {
    const draft = createDraft();
    if (!draft) return;

    try {
      await navigator.clipboard.writeText(`Кому: ${draft.recipient}\nТема: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Не удалось скопировать письмо в буфер обмена.");
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Проверка письма</h3>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        Локальный клиент использует настройки Windows. Если Outlook не запускает черновик, откройте письмо в Outlook Web.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="mailtoTestRecipient" className="block">
            Получатель
          </Label>
          <Input
            id="mailtoTestRecipient"
            type="email"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="admin@company.ru"
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="mailtoTestTemplate" className="block">
            Шаблон
          </Label>
          <Select
            id="mailtoTestTemplate"
            value={templateKey}
            onChange={(event) => setTemplateKey(event.target.value as TemplateKey)}
            className="mt-2"
          >
            {TEMPLATE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={openLocalMailClient}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
          >
            <Mail aria-hidden="true" className="h-4 w-4" />
            Локальный клиент
          </button>

          <button
            type="button"
            onClick={openOutlookWeb}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
          >
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
            Outlook Web
          </button>

          <button
            type="button"
            onClick={copyDraft}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
            {copied ? "Скопировано" : "Копировать письмо"}
          </button>
        </div>

        {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      </div>
    </section>
  );
}
