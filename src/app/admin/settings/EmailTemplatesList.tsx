"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  Eye,
  GripVertical,
  Heading2,
  Image as ImageIcon,
  Link,
  List,
  ListOrdered,
  Mail,
  Pilcrow,
  Quote,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { formatHoursLabel } from "@/lib/email/template-format";
import type { PlatformHtmlEmailTemplate } from "@/lib/email/template-settings";
import {
  buildPlainTextEmailFromRichHtml,
  buildPlatformHtmlEmailFromRichHtml,
  buildRichEmailEditorHtmlFromText,
} from "@/lib/email/template-settings";
import { normalizeRichTextForEditor } from "@/lib/rich-text";

const HTML_TEMPLATE_DEFINITIONS = [
  {
    key: "welcome",
    prefix: "welcome",
    title: "Приветственное письмо",
    description: "Используется для активации доступа и стартовой информации о платформе.",
  },
  {
    key: "passwordReset",
    prefix: "passwordReset",
    title: "Сброс пароля",
    description: "Используется, когда администратор генерирует новый временный пароль пользователю.",
  },
  {
    key: "courseAssigned",
    prefix: "courseAssigned",
    title: "Назначение курса",
    description: "Используется, когда ученику назначают опубликованный курс.",
  },
  {
    key: "certificate",
    prefix: "certificate",
    title: "Сертификат",
    description: "Пока не используется",
  },
] as const;

const TEMPLATE_VARIABLES = [
  {
    token: "{{firstName}}",
    label: "Имя получателя",
    description: "Только имя без фамилии. Например: Алексей.",
  },
  {
    token: "{{userName}}",
    label: "Имя получателя",
    description: "Совместимость со старыми шаблонами. Сейчас подставляет то же, что и firstName.",
  },
  {
    token: "{{fullName}}",
    label: "Имя и фамилия",
    description: "Полное имя получателя. Например: Алексей Тишин.",
  },
  {
    token: "{{login}}",
    label: "Логин",
    description: "Логин учетной записи, с которым пользователь входит в систему.",
  },
  {
    token: "{{temporaryPassword}}",
    label: "Временный пароль",
    description: "Пароль, который отправляется при создании пользователя или сбросе пароля.",
  },
  {
    token: "{{passwordInstruction}}",
    label: "Пароль или инструкция",
    description: "Временный пароль либо текст о том, что пароль нужно задать на странице активации.",
  },
  {
    token: "{{loginUrl}}",
    label: "Ссылка на вход",
    description: "Адрес страницы входа в систему обучения.",
  },
  {
    token: "{{activationUrl}}",
    label: "Ссылка активации",
    description: "Персональная ссылка для активации нового аккаунта.",
  },
  {
    token: "{{accessUrl}}",
    label: "Основная ссылка действия",
    description: "Главная ссылка письма: активация, вход или другое действие по шаблону.",
  },
  {
    token: "{{linkTtlHours}}",
    label: "Срок ссылки в часах",
    description: "Только число часов действия ссылки. Например: 48.",
  },
  {
    token: "{{linkTtlHoursLabel}}",
    label: "Срок ссылки текстом",
    description: "Срок действия с правильным склонением. Например: 48 часов.",
  },
  {
    token: "{{courseTitle}}",
    label: "Название курса",
    description: "Название курса, назначенного или указанного в письме.",
  },
  {
    token: "{{courseUrl}}",
    label: "Ссылка на курс",
    description: "Прямая ссылка на страницу курса.",
  },
  {
    token: "{{accessDeadline}}",
    label: "Срок выполнения курса",
    description: "Готовая фраза о дедлайне курса или о том, что срок не ограничен.",
  },
  {
    token: "{{certificateUrl}}",
    label: "Ссылка на сертификат",
    description: "Ссылка на скачивание готового сертификата.",
  },
] as const;

type EmailBuilderBlockIcon = "heading" | "image" | "link" | "list" | "mail" | "orderedList" | "quote" | "text";

type EmailBuilderBlockKind =
  | "heading"
  | "subheading"
  | "paragraph"
  | "quote"
  | "list"
  | "orderedList"
  | "actionLink"
  | "image";

type EmailBlockBackground = "transparent" | `#${string}`;
type EmailBlockPadding = "none" | "small" | "medium" | "large";

type EmailCanvasBlock = {
  id: string;
  kind: EmailBuilderBlockKind;
  html: string;
  backgroundColor: EmailBlockBackground;
  padding: EmailBlockPadding;
};

type EmailBuilderBlock = {
  key: string;
  label: string;
  description: string;
  icon: EmailBuilderBlockIcon;
  html: string;
};

const EMAIL_BUILDER_BLOCKS = [
  {
    key: "greeting",
    label: "Приветствие",
    description: "Только имя",
    icon: "mail",
    html: "<p>Здравствуйте, {{firstName}}!</p>",
  },
  {
    key: "heading",
    label: "Заголовок",
    description: "Крупный акцент",
    icon: "heading",
    html: "<h2>Заголовок письма</h2>",
  },
  {
    key: "paragraph",
    label: "Текст",
    description: "Обычный абзац",
    icon: "text",
    html: "<p>Опишите, что нужно сделать получателю.</p>",
  },
  {
    key: "image",
    label: "Картинка",
    description: "Баннер или иллюстрация",
    icon: "image",
    html: '<figure data-kind="image" data-pad="none"><img src="https://placehold.co/600x240/png?text=Image" alt="Изображение" data-width="100"></figure>',
  },
  {
    key: "action-link",
    label: "Ссылка действия",
    description: "Основной переход",
    icon: "link",
    html: "<p>Перейдите по ссылке:<br>{{accessUrl}}</p>",
  },
  {
    key: "deadline",
    label: "Срок ссылки",
    description: "Важное условие",
    icon: "quote",
    html: "<blockquote>Ссылка действует {{linkTtlHoursLabel}}.</blockquote>",
  },
  {
    key: "course",
    label: "Курс",
    description: "Название, срок, ссылка",
    icon: "mail",
    html: "<p>Курс: {{courseTitle}}</p><p>{{accessDeadline}}</p><p>Открыть курс:<br>{{courseUrl}}</p>",
  },
  {
    key: "list",
    label: "Список",
    description: "Несколько пунктов",
    icon: "list",
    html: "<ul><li>Проверьте данные</li><li>Перейдите по ссылке</li><li>Завершите действие</li></ul>",
  },
  {
    key: "footer",
    label: "Подпись",
    description: "Финальная строка",
    icon: "text",
    html: "<p>Если вы не ожидали это письмо, свяжитесь с администратором платформы.</p>",
  },
] as const satisfies EmailBuilderBlock[];

const EMAIL_BLOCK_KIND_OPTIONS = [
  { value: "heading", label: "Заголовок" },
  { value: "subheading", label: "Подзаголовок" },
  { value: "paragraph", label: "Текст" },
  { value: "actionLink", label: "Ссылка действия" },
  { value: "quote", label: "Акцент" },
  { value: "list", label: "Список" },
  { value: "orderedList", label: "Нумерованный список" },
  { value: "image", label: "Картинка" },
] as const satisfies Array<{ value: EmailBuilderBlockKind; label: string }>;

const EMAIL_BLOCK_KIND_LABELS: Record<EmailBuilderBlockKind, string> = {
  actionLink: "Ссылка действия",
  heading: "Заголовок",
  image: "Картинка",
  list: "Список",
  orderedList: "Нумерованный список",
  paragraph: "Текст",
  quote: "Акцент",
  subheading: "Подзаголовок",
};

const EMAIL_BLOCK_PLACEHOLDERS: Record<EmailBuilderBlockKind, string> = {
  actionLink: "Текст перед ссылкой\n{{accessUrl}}",
  heading: "Заголовок письма",
  image: "https://example.com/image.png",
  list: "Первый пункт\nВторой пункт",
  orderedList: "Первый шаг\nВторой шаг",
  paragraph: "Текст письма",
  quote: "Важное примечание",
  subheading: "Подзаголовок",
};

const EMAIL_BLOCK_BACKGROUNDS = [
  { value: "transparent", label: "Без фона", swatch: "transparent" },
  { value: "#ffffff", label: "Белый", swatch: "#ffffff" },
  { value: "#eef6ff", label: "Голубой", swatch: "#eef6ff" },
  { value: "#ecfdf3", label: "Зеленый", swatch: "#ecfdf3" },
  { value: "#fff7ed", label: "Теплый", swatch: "#fff7ed" },
  { value: "#f4f4f5", label: "Серый", swatch: "#f4f4f5" },
] as const satisfies Array<{ value: EmailBlockBackground; label: string; swatch: string }>;

const EMAIL_BLOCK_PADDINGS = [
  { value: "none", label: "Без отступа", pixels: 0 },
  { value: "small", label: "Малый", pixels: 12 },
  { value: "medium", label: "Средний", pixels: 20 },
  { value: "large", label: "Большой", pixels: 28 },
] as const satisfies Array<{ value: EmailBlockPadding; label: string; pixels: number }>;

const TOP_LEVEL_EMAIL_BLOCK_RE = /<(figure|p|h2|h3|blockquote|ul|ol)\b[^>]*>[\s\S]*?<\/\1>/gi;
const URL_TEMPLATE_TOKEN_RE = /\{\{\s*(?:accessUrl|activationUrl|courseUrl|certificateUrl|loginUrl)\s*\}\}/i;
const EMAIL_BUILDER_BLOCK_DRAG_TYPE = "application/x-email-builder-block";

type EmailBuilderViewport = "desktop" | "mobile";

type TemplateKey = (typeof HTML_TEMPLATE_DEFINITIONS)[number]["key"];
type HtmlTemplateField = keyof PlatformHtmlEmailTemplate;
type TemplateDefinition = (typeof HTML_TEMPLATE_DEFINITIONS)[number];
type TemplateState = Record<TemplateKey, PlatformHtmlEmailTemplate>;

type Props = {
  linkTtlHours: number;
  previewData: EmailTemplatePreviewData;
  templates: TemplateState;
};

const HTML_TEMPLATE_FIELDS = ["subject", "html", "text", "editorHtml"] as const satisfies HtmlTemplateField[];

type EmailTemplatePreviewData = {
  courses: Array<{
    id: string;
    title: string;
    url: string;
  }>;
  users: Array<{
    id: string;
    firstName: string;
    name: string;
    email: string;
  }>;
};

function htmlFieldInputName(prefix: string, field: HtmlTemplateField) {
  return `${prefix}${field[0].toUpperCase()}${field.slice(1)}`;
}

function preferFirstNameToken(value: string) {
  return value.replace(/\{\{\s*userName\s*\}\}/g, "{{firstName}}");
}

function ensureEditableTemplate(template: PlatformHtmlEmailTemplate): PlatformHtmlEmailTemplate {
  const editorHtml = preferFirstNameToken(template.editorHtml || buildRichEmailEditorHtmlFromText(template.text));
  const html = preferFirstNameToken(template.html || buildPlatformHtmlEmailFromRichHtml(editorHtml));
  const text = preferFirstNameToken(template.text || buildPlainTextEmailFromRichHtml(editorHtml));

  return {
    subject: template.subject,
    editorHtml,
    html,
    text,
  };
}

function createInitialState(templates: TemplateState): TemplateState {
  return {
    welcome: ensureEditableTemplate(templates.welcome),
    passwordReset: ensureEditableTemplate(templates.passwordReset),
    courseAssigned: ensureEditableTemplate(templates.courseAssigned),
    certificate: ensureEditableTemplate(templates.certificate),
  };
}

function buildPreviewDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;">${html}</body></html>`;
}

function replaceTemplateVariables(value: string, variables: Record<string, string | null | undefined>) {
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const replacement = variables[key];
    return replacement?.trim() ? replacement : match;
  });
}

function absolutePreviewUrl(origin: string, url: string | null | undefined) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function sampleUrl(origin: string, path: string) {
  return origin ? `${origin}${path}` : path;
}

function escapeBuilderHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeBuilderEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeBuilderAttribute(value: string) {
  return escapeBuilderHtml(value).replaceAll("`", "&#96;");
}

function readBuilderHtmlAttribute(rawAttrs: string, name: string) {
  const match = rawAttrs.match(new RegExp("\\s" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return decodeBuilderEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? "");
}

function isEmailHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function normalizeEmailBlockBackground(value: string): EmailBlockBackground {
  if (value === "transparent") return "transparent";
  return isEmailHexColor(value) ? (value.trim().toLowerCase() as EmailBlockBackground) : "transparent";
}

function isEmailBlockBackground(value: string): value is EmailBlockBackground {
  return value === "transparent" || isEmailHexColor(value);
}

function isEmailBlockPadding(value: string): value is EmailBlockPadding {
  return EMAIL_BLOCK_PADDINGS.some((item) => item.value === value);
}

function emailBlockPaddingPixels(value: EmailBlockPadding) {
  return EMAIL_BLOCK_PADDINGS.find((item) => item.value === value)?.pixels ?? 0;
}

function isSafeBuilderImageSrc(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("/");
}

type EmailImageSettings = {
  alt: string;
  src: string;
  width: number;
};

function imageSettingsFromHtml(html: string): EmailImageSettings {
  const match = html.match(/<img([^>]*)>/i);
  const rawAttrs = match?.[1] ?? "";
  const width = Number(readBuilderHtmlAttribute(rawAttrs, "data-width") || readBuilderHtmlAttribute(rawAttrs, "width"));

  return {
    alt: readBuilderHtmlAttribute(rawAttrs, "alt"),
    src: readBuilderHtmlAttribute(rawAttrs, "src"),
    width: Number.isInteger(width) && width >= 25 && width <= 100 ? width : 100,
  };
}

function buildImageBlockHtml(settings: EmailImageSettings) {
  const src = settings.src.trim();
  if (!src || !isSafeBuilderImageSrc(src)) {
    return "<p>Добавьте ссылку на изображение.</p>";
  }

  const width = Math.max(25, Math.min(100, Math.round(settings.width || 100)));
  return `<img src="${escapeBuilderAttribute(src)}" alt="${escapeBuilderAttribute(settings.alt)}" data-width="${width}">`;
}

function blockTextFromHtml(html: string) {
  const withLineBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|h2|h3|blockquote)>/gi, "\n")
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, "");

  return decodeBuilderEntities(withLineBreaks.replace(/<[^>]+>/g, ""))
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function linesFromBlockText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function inlineHtmlFromText(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line) => escapeBuilderHtml(line)).join("<br>");
}

function buildBlockHtmlFromText(kind: EmailBuilderBlockKind, text: string) {
  const trimmed = text.trim();

  switch (kind) {
    case "heading":
      return `<h2>${escapeBuilderHtml(trimmed)}</h2>`;
    case "subheading":
      return `<h3>${escapeBuilderHtml(trimmed)}</h3>`;
    case "quote":
      return `<blockquote>${inlineHtmlFromText(trimmed)}</blockquote>`;
    case "list": {
      const items = linesFromBlockText(trimmed);
      return `<ul>${items.map((item) => `<li>${escapeBuilderHtml(item)}</li>`).join("")}</ul>`;
    }
    case "orderedList": {
      const items = linesFromBlockText(trimmed);
      return `<ol>${items.map((item) => `<li>${escapeBuilderHtml(item)}</li>`).join("")}</ol>`;
    }
    case "image":
      return buildImageBlockHtml({ alt: "", src: trimmed, width: 100 });
    case "actionLink":
    case "paragraph":
      return `<p>${inlineHtmlFromText(trimmed)}</p>`;
  }
}

function inferEmailBlockKind(tag: string | undefined, html: string): EmailBuilderBlockKind {
  switch (tag?.toLowerCase()) {
    case "h2":
      return "heading";
    case "h3":
      return "subheading";
    case "blockquote":
      return "quote";
    case "ul":
      return "list";
    case "ol":
      return "orderedList";
    case "img":
      return "image";
    default:
      return URL_TEMPLATE_TOKEN_RE.test(html) ? "actionLink" : "paragraph";
  }
}

function createEmailCanvasBlock(html: string, id: string): EmailCanvasBlock {
  const normalized = normalizeRichTextForEditor(html);
  const figureMatch = normalized.match(/^<figure\b([^>]*)>([\s\S]*)<\/figure>$/i);
  const figureAttrs = figureMatch?.[1] ?? "";
  const figureContent = figureMatch?.[2] ?? normalized;
  const contentHtml = normalizeRichTextForEditor(figureContent);
  const tag = contentHtml.match(/^<([a-z0-9]+)/i)?.[1];
  const background = readBuilderHtmlAttribute(figureAttrs, "data-bg");
  const padding = readBuilderHtmlAttribute(figureAttrs, "data-pad");
  const figureKind = readBuilderHtmlAttribute(figureAttrs, "data-kind");
  const inferredKind = figureKind === "image" ? "image" : inferEmailBlockKind(tag, contentHtml);

  return {
    id,
    kind: inferredKind,
    html: contentHtml,
    backgroundColor: isEmailBlockBackground(background) ? normalizeEmailBlockBackground(background) : "transparent",
    padding: isEmailBlockPadding(padding) ? padding : "none",
  };
}
function parseEditorHtmlToBlocks(value: string, idPrefix = "email-block") {
  const normalized = normalizeRichTextForEditor(value);
  const matches = Array.from(normalized.matchAll(TOP_LEVEL_EMAIL_BLOCK_RE));

  if (!matches.length) {
    return [createEmailCanvasBlock(normalized, `${idPrefix}-1`)];
  }

  return matches.map((match, index) => createEmailCanvasBlock(match[0], `${idPrefix}-${index + 1}`));
}

function serializeEmailCanvasBlock(block: EmailCanvasBlock) {
  const attributes: string[] = [];
  if (block.kind === "image") attributes.push('data-kind="image"');
  if (block.backgroundColor !== "transparent") attributes.push(`data-bg="${block.backgroundColor}"`);
  if (block.padding !== "none") attributes.push(`data-pad="${block.padding}"`);

  return attributes.length ? `<figure ${attributes.join(" ")}>${block.html}</figure>` : block.html;
}

function buildEditorHtmlFromBlocks(blocks: EmailCanvasBlock[]) {
  return normalizeRichTextForEditor(blocks.map(serializeEmailCanvasBlock).join(""));
}
export function EmailTemplatesList({ linkTtlHours, previewData, templates }: Props) {
  const [values, setValues] = useState<TemplateState>(() => createInitialState(templates));
  const [activeKey, setActiveKey] = useState<TemplateKey | null>(null);
  const activeDefinition = HTML_TEMPLATE_DEFINITIONS.find((template) => template.key === activeKey) ?? null;

  useEffect(() => {
    if (!activeKey) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveKey(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeKey]);

  function updateHtmlTemplate(key: TemplateKey, field: HtmlTemplateField, value: string) {
    setValues((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
  }

  function updateHtmlEditorTemplate(key: TemplateKey, editorHtml: string) {
    setValues((current) => ({
      ...current,
      [key]: {
        ...current[key],
        editorHtml,
        html: buildPlatformHtmlEmailFromRichHtml(editorHtml),
        text: buildPlainTextEmailFromRichHtml(editorHtml),
      },
    }));
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
      <h3 className="text-sm font-semibold text-zinc-950">Шаблоны писем</h3>
      <p className="mt-2 text-xs text-zinc-500">
        Все шаблоны редактируются в блочном конструкторе. Системные данные подставляются через переменные.
      </p>

      {HTML_TEMPLATE_DEFINITIONS.map((template) =>
        HTML_TEMPLATE_FIELDS.map((field) => (
          <input
            key={`${template.key}-${field}`}
            id={htmlFieldInputName(template.prefix, field)}
            name={htmlFieldInputName(template.prefix, field)}
            type="hidden"
            value={values[template.key][field]}
            readOnly
          />
        ))
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {HTML_TEMPLATE_DEFINITIONS.map((template, index) => {
          const current = values[template.key];
          const Icon = template.key === "courseAssigned" ? Send : Mail;

          return (
            <button
              key={template.key}
              type="button"
              onClick={() => setActiveKey(template.key)}
              className={`flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 ${
                index > 0 ? "border-t border-zinc-200" : ""
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-zinc-950">{template.title}</span>
                <span className="mt-1 block text-xs text-zinc-500">{template.description}</span>
                <span className="mt-2 block truncate text-xs text-zinc-700">Тема: {current.subject}</span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
            </button>
          );
        })}
      </div>

      {activeDefinition ? (
        <HtmlTemplateDialog
          key={activeDefinition.key}
          definition={activeDefinition}
          template={values[activeDefinition.key]}
          linkTtlHours={linkTtlHours}
          previewData={previewData}
          onClose={() => setActiveKey(null)}
          onUpdate={(field, value) => updateHtmlTemplate(activeDefinition.key, field, value)}
          onEditorChange={(value) => updateHtmlEditorTemplate(activeDefinition.key, value)}
        />
      ) : null}
    </section>
  );
}

function HtmlTemplateDialog({
  definition,
  template,
  linkTtlHours,
  previewData,
  onClose,
  onUpdate,
  onEditorChange,
}: {
  definition: TemplateDefinition;
  template: PlatformHtmlEmailTemplate;
  linkTtlHours: number;
  previewData: EmailTemplatePreviewData;
  onClose: () => void;
  onUpdate: (field: HtmlTemplateField, value: string) => void;
  onEditorChange: (value: string) => void;
}) {
  const [previewCourseId, setPreviewCourseId] = useState("");
  const [previewUserId, setPreviewUserId] = useState("");
  const [previewDeadline, setPreviewDeadline] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const previewCourse = previewData.courses.find((course) => course.id === previewCourseId) ?? null;
  const previewUser = previewData.users.find((user) => user.id === previewUserId) ?? null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const previewLogin = previewUser?.email ? previewUser.email.split("@")[0] : "test.user";
  const previewVariables = {
    accessDeadline: previewDeadline,
    accessUrl: sampleUrl(origin, "/activate/test-token"),
    activationUrl: sampleUrl(origin, "/activate/test-token"),
    certificateUrl: sampleUrl(origin, "/certificates/test-certificate"),
    courseTitle: previewCourse?.title,
    courseUrl: absolutePreviewUrl(origin, previewCourse?.url),
    firstName: previewUser?.firstName,
    fullName: previewUser?.name,
    linkTtlHours: String(linkTtlHours),
    linkTtlHoursLabel: formatHoursLabel(linkTtlHours),
    login: previewLogin,
    loginUrl: sampleUrl(origin, "/login"),
    passwordInstruction: "Test-1234",
    temporaryPassword: "Test-1234",
    userName: previewUser?.firstName,
  };
  const previewHtml = buildPreviewDocument(replaceTemplateVariables(template.html, previewVariables));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Закрыть окно настроек HTML-шаблона"
        className="absolute inset-0 bg-zinc-950/45"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="emailTemplateDialogTitle"
        className="relative z-10 max-h-[calc(100vh-48px)] w-full max-w-[1500px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
      >
        <div className="max-h-[calc(100vh-48px)] overflow-y-auto p-5">
          <TemplateDialogHeader title={definition.title} description={definition.description} onClose={onClose} />

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label htmlFor="htmlTemplateSubject" className="block text-sm font-medium text-zinc-900">
              Тема письма
              <input
                id="htmlTemplateSubject"
                value={template.subject}
                onChange={(event) => onUpdate("subject", event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none ring-teal-500 focus:ring-2"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              <Eye aria-hidden="true" className="h-4 w-4" />
              Предпросмотр
            </button>
          </div>

          <EmailVisualEditor value={template.editorHtml} onChange={onEditorChange} />

          <TemplateDialogFooter onClose={onClose} />
        </div>

        {isPreviewOpen ? (
          <EmailTemplatePreviewDialog
            previewCourseId={previewCourseId}
            previewData={previewData}
            previewDeadline={previewDeadline}
            previewHtml={previewHtml}
            previewUserId={previewUserId}
            onClose={() => setIsPreviewOpen(false)}
            onPreviewCourseChange={setPreviewCourseId}
            onPreviewDeadlineChange={setPreviewDeadline}
            onPreviewUserChange={setPreviewUserId}
          />
        ) : null}
      </section>
    </div>
  );
}

function EmailTemplatePreviewDialog({
  previewCourseId,
  previewData,
  previewDeadline,
  previewHtml,
  previewUserId,
  onClose,
  onPreviewCourseChange,
  onPreviewDeadlineChange,
  onPreviewUserChange,
}: {
  previewCourseId: string;
  previewData: EmailTemplatePreviewData;
  previewDeadline: string;
  previewHtml: string;
  previewUserId: string;
  onClose: () => void;
  onPreviewCourseChange: (value: string) => void;
  onPreviewDeadlineChange: (value: string) => void;
  onPreviewUserChange: (value: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/30 px-4 py-6">
      <section className="max-h-[calc(100vh-72px)] w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Eye aria-hidden="true" className="h-4 w-4" />
            Предпросмотр
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть предпросмотр"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-145px)] overflow-y-auto p-5">
          <div className="mb-4 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-3 md:grid-cols-3">
            <label className="block text-xs font-medium text-zinc-700">
              Курс для preview
              <select
                value={previewCourseId}
                onChange={(event) => onPreviewCourseChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
              >
                <option value="">Показать переменные</option>
                {previewData.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Получатель
              <select
                value={previewUserId}
                onChange={(event) => onPreviewUserChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
              >
                <option value="">Показать переменные</option>
                {previewData.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Срок выполнения
              <input
                value={previewDeadline}
                onChange={(event) => onPreviewDeadlineChange(event.target.value)}
                placeholder="Например: до 31.05.2026"
                className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
              />
            </label>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
            <iframe
              title="Предпросмотр HTML письма"
              sandbox=""
              srcDoc={previewHtml}
              className="h-[640px] w-full rounded-xl bg-white"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function EmailBuilderBlockIcon({ icon }: { icon: EmailBuilderBlockIcon }) {
  const className = "h-4 w-4";

  switch (icon) {
    case "heading":
      return <Heading2 aria-hidden="true" className={className} />;
    case "image":
      return <ImageIcon aria-hidden="true" className={className} />;
    case "link":
      return <Link aria-hidden="true" className={className} />;
    case "list":
      return <List aria-hidden="true" className={className} />;
    case "mail":
      return <Mail aria-hidden="true" className={className} />;
    case "orderedList":
      return <ListOrdered aria-hidden="true" className={className} />;
    case "quote":
      return <Quote aria-hidden="true" className={className} />;
    case "text":
      return <Pilcrow aria-hidden="true" className={className} />;
  }
}

function EmailBuilderIconButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EmailBlockPreview({ block }: { block: EmailCanvasBlock }) {
  const previewClassName =
    "email-builder-preview text-[15px] leading-relaxed text-slate-800 [&_a]:text-[#0563c1] [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-teal-300 [&_blockquote]:bg-teal-50 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-slate-700 [&_h2]:text-[24px] [&_h2]:font-bold [&_h2]:leading-tight [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:leading-snug [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_li]:mb-1 [&_li]:ml-5 [&_ol]:list-decimal [&_p]:m-0 [&_strong]:font-semibold [&_ul]:list-disc";

  if (block.kind === "image" && !/<img\b/i.test(block.html)) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Добавьте ссылку на изображение
      </div>
    );
  }

  return <div className={previewClassName} dangerouslySetInnerHTML={{ __html: block.html }} />;
}

function EmailVisualEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [blocks, setBlocks] = useState<EmailCanvasBlock[]>(() => parseEditorHtmlToBlocks(value));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>("email-block-1");
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<EmailBuilderViewport>("desktop");
  const [showGrid, setShowGrid] = useState(true);
  const [customBackgroundDraft, setCustomBackgroundDraft] = useState("#ffffff");
  const nextBlockNumberRef = useRef(1000);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? blocks[0] ?? null;
  const selectedBlockBackgroundColor = selectedBlock?.backgroundColor;
  const selectedBlockDraftId = selectedBlock?.id;

  useEffect(() => {
    if (!selectedBlockBackgroundColor) return;
    setCustomBackgroundDraft(selectedBlockBackgroundColor === "transparent" ? "#ffffff" : selectedBlockBackgroundColor);
  }, [selectedBlockBackgroundColor, selectedBlockDraftId]);

  function makeBlockId() {
    const id = `email-block-${nextBlockNumberRef.current}`;
    nextBlockNumberRef.current += 1;
    return id;
  }

  function commitBlocks(nextBlocks: EmailCanvasBlock[], requestedSelectedBlockId?: string | null) {
    const safeBlocks = nextBlocks.length
      ? nextBlocks
      : [
          {
            id: makeBlockId(),
            kind: "paragraph" as const,
            html: "<p></p>",
            backgroundColor: "transparent" as const,
            padding: "none" as const,
          },
        ];
    const nextSelectedBlockId =
      requestedSelectedBlockId && safeBlocks.some((block) => block.id === requestedSelectedBlockId)
        ? requestedSelectedBlockId
        : safeBlocks[0]?.id ?? null;

    setBlocks(safeBlocks);
    setSelectedBlockId(nextSelectedBlockId);
    onChange(buildEditorHtmlFromBlocks(safeBlocks));
  }

  function createBlocksFromTemplate(template: EmailBuilderBlock) {
    return parseEditorHtmlToBlocks(template.html, "new-block").map((block) => ({
      ...block,
      id: makeBlockId(),
    }));
  }

  function insertBuilderBlock(template: EmailBuilderBlock, insertIndex = blocks.length) {
    const newBlocks = createBlocksFromTemplate(template);
    const nextBlocks = [...blocks];
    nextBlocks.splice(insertIndex, 0, ...newBlocks);
    commitBlocks(nextBlocks, newBlocks[0]?.id ?? selectedBlockId);
  }

  function addBuilderBlock(template: EmailBuilderBlock) {
    insertBuilderBlock(template);
  }

  function updateBlockText(blockId: string, text: string) {
    const nextBlocks = blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            html: buildBlockHtmlFromText(block.kind, text),
          }
        : block
    );
    commitBlocks(nextBlocks, blockId);
  }

  function updateBlockKind(blockId: string, kind: EmailBuilderBlockKind) {
    const nextBlocks = blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            kind,
            html: buildBlockHtmlFromText(kind, blockTextFromHtml(block.html)),
          }
        : block
    );
    commitBlocks(nextBlocks, blockId);
  }

  function updateBlockBackground(blockId: string, backgroundColor: EmailBlockBackground) {
    const nextBackgroundColor = normalizeEmailBlockBackground(backgroundColor);
    const nextBlocks = blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            backgroundColor: nextBackgroundColor,
          }
        : block
    );
    commitBlocks(nextBlocks, blockId);
  }

  function updateCustomBlockBackground(blockId: string, value: string) {
    setCustomBackgroundDraft(value);
    if (isEmailHexColor(value)) updateBlockBackground(blockId, value as EmailBlockBackground);
  }

  function updateBlockPadding(blockId: string, padding: EmailBlockPadding) {
    const nextBlocks = blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            padding,
          }
        : block
    );
    commitBlocks(nextBlocks, blockId);
  }

  function updateImageSettings(blockId: string, settings: EmailImageSettings) {
    const nextBlocks = blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            kind: "image" as const,
            html: buildImageBlockHtml(settings),
          }
        : block
    );
    commitBlocks(nextBlocks, blockId);
  }
  function appendVariableToSelectedBlock(token: string) {
    if (!selectedBlock) return;
    const currentText = blockTextFromHtml(selectedBlock.html);
    updateBlockText(selectedBlock.id, currentText ? `${currentText} ${token}` : token);
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    const currentIndex = blocks.findIndex((block) => block.id === blockId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= blocks.length) return;

    const nextBlocks = [...blocks];
    const [block] = nextBlocks.splice(currentIndex, 1);
    nextBlocks.splice(nextIndex, 0, block);
    commitBlocks(nextBlocks, blockId);
  }

  function duplicateBlock(blockId: string) {
    const currentIndex = blocks.findIndex((block) => block.id === blockId);
    if (currentIndex < 0) return;

    const clone = {
      ...blocks[currentIndex],
      id: makeBlockId(),
    };
    const nextBlocks = [...blocks];
    nextBlocks.splice(currentIndex + 1, 0, clone);
    commitBlocks(nextBlocks, clone.id);
  }

  function deleteBlock(blockId: string) {
    const currentIndex = blocks.findIndex((block) => block.id === blockId);
    const nextBlocks = blocks.filter((block) => block.id !== blockId);
    const nextSelectedBlockId = nextBlocks[Math.max(0, currentIndex - 1)]?.id ?? nextBlocks[0]?.id ?? null;
    commitBlocks(nextBlocks, nextSelectedBlockId);
  }

  function moveBlockToIndex(sourceBlockId: string, insertIndex: number) {
    const sourceIndex = blocks.findIndex((block) => block.id === sourceBlockId);
    if (sourceIndex < 0) return;

    const nextBlocks = [...blocks];
    const [sourceBlock] = nextBlocks.splice(sourceIndex, 1);
    const normalizedInsertIndex = sourceIndex < insertIndex ? insertIndex - 1 : insertIndex;
    nextBlocks.splice(Math.max(0, Math.min(normalizedInsertIndex, nextBlocks.length)), 0, sourceBlock);
    commitBlocks(nextBlocks, sourceBlockId);
  }

  function handlePaletteDragStart(event: React.DragEvent<HTMLButtonElement>, blockKey: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(EMAIL_BUILDER_BLOCK_DRAG_TYPE, blockKey);
  }

  function handleCanvasDrop(event: React.DragEvent<HTMLElement>, insertIndex = blocks.length) {
    event.preventDefault();
    const templateKey = event.dataTransfer.getData(EMAIL_BUILDER_BLOCK_DRAG_TYPE);
    if (templateKey) {
      const template = EMAIL_BUILDER_BLOCKS.find((block) => block.key === templateKey);
      if (template) insertBuilderBlock(template, insertIndex);
      setDraggingBlockId(null);
      return;
    }

    const sourceBlockId = event.dataTransfer.getData("text/plain") || draggingBlockId;
    if (sourceBlockId) moveBlockToIndex(sourceBlockId, insertIndex);
    setDraggingBlockId(null);
  }

  function handleBlockDrop(event: React.DragEvent<HTMLElement>, targetIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const insertIndex = event.clientY > rect.top + rect.height / 2 ? targetIndex + 1 : targetIndex;
    handleCanvasDrop(event, insertIndex);
  }

  const canvasWidthClassName = viewport === "desktop" ? "max-w-[600px]" : "max-w-[360px]";
  const canvasGridClassName = showGrid
    ? "bg-[linear-gradient(rgba(15,49,93,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,49,93,0.035)_1px,transparent_1px)] bg-[length:24px_24px]"
    : "";
  const selectedImageSettings = selectedBlock?.kind === "image" ? imageSettingsFromHtml(selectedBlock.html) : null;

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm font-medium text-zinc-900">Письмо</label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
            {(["desktop", "mobile"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewport(mode)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewport === mode ? "bg-[#0f315d] text-white" : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {mode === "desktop" ? "ПК" : "Мобильный"}
              </button>
            ))}
          </div>
          <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => setShowGrid(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-teal-600"
            />
            Сетка
          </label>
        </div>
      </div>

      <div className="grid gap-4 xl:h-[calc(100vh-290px)] xl:min-h-[560px] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="min-h-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase text-zinc-500">Готовые блоки</div>
          <div className="grid gap-2">
            {EMAIL_BUILDER_BLOCKS.map((block) => (
              <button
                key={block.key}
                type="button"
                draggable
                onClick={() => addBuilderBlock(block)}
                onDragStart={(event) => handlePaletteDragStart(event, block.key)}
                className="flex min-h-14 cursor-grab items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition hover:border-teal-200 hover:bg-teal-50 active:cursor-grabbing"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-600 shadow-sm">
                  <EmailBuilderBlockIcon icon={block.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-900">{block.label}</span>
                  <span className="block truncate text-xs text-zinc-500">{block.description}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Рабочее поле</div>
              <div className="text-xs text-zinc-500">{blocks.length} блоков</div>
            </div>
            <div className="text-xs font-medium text-zinc-500">{viewport === "desktop" ? "600 px" : "360 px"}</div>
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleCanvasDrop(event)}
            className="min-h-0 flex-1 overflow-auto bg-slate-200 px-5 py-6"
          >
            <div className={`mx-auto min-h-full w-full ${canvasWidthClassName} transition-all`}>
              <div className={`min-h-[640px] bg-white px-8 py-10 shadow-xl ${canvasGridClassName}`}>
                {blocks.map((block, index) => {
                  const isSelected = block.id === selectedBlock?.id;
                  const isDragging = block.id === draggingBlockId;
                  const blockPadding = emailBlockPaddingPixels(block.padding);
                  const blockBackground = block.backgroundColor === "transparent" ? undefined : block.backgroundColor;

                  return (
                    <article
                      key={block.id}
                      draggable
                      onClick={() => setSelectedBlockId(block.id)}
                      onDragStart={(event) => {
                        setDraggingBlockId(block.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", block.id);
                      }}
                      onDragEnd={() => setDraggingBlockId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleBlockDrop(event, index)}
                      className={`group relative -mx-3 mb-3 cursor-pointer rounded-xl border px-3 py-3 transition ${
                        isSelected
                          ? "border-teal-400 bg-teal-50/60 ring-2 ring-teal-100"
                          : "border-transparent hover:border-teal-200 hover:bg-teal-50/40"
                      } ${isDragging ? "opacity-50" : ""}`}
                    >
                      <div className="absolute -left-3 top-3 hidden h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 shadow-sm group-hover:flex">
                        <GripVertical aria-hidden="true" className="h-4 w-4" />
                      </div>
                      <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex">
                        <EmailBuilderIconButton
                          label="Выше"
                          onClick={() => moveBlock(block.id, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp aria-hidden="true" className="h-4 w-4" />
                        </EmailBuilderIconButton>
                        <EmailBuilderIconButton
                          label="Ниже"
                          onClick={() => moveBlock(block.id, 1)}
                          disabled={index === blocks.length - 1}
                        >
                          <ArrowDown aria-hidden="true" className="h-4 w-4" />
                        </EmailBuilderIconButton>
                        <EmailBuilderIconButton label="Дублировать" onClick={() => duplicateBlock(block.id)}>
                          <Copy aria-hidden="true" className="h-4 w-4" />
                        </EmailBuilderIconButton>
                        <EmailBuilderIconButton label="Удалить" onClick={() => deleteBlock(block.id)}>
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </EmailBuilderIconButton>
                      </div>
                      <div className="mb-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 group-hover:bg-white">
                        {EMAIL_BLOCK_KIND_LABELS[block.kind]}
                      </div>
                      <div
                        className="rounded-xl transition"
                        style={{
                          backgroundColor: blockBackground,
                          padding: blockPadding,
                        }}
                      >
                        <EmailBlockPreview block={block} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase text-zinc-500">Настройки блока</div>
          {selectedBlock ? (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-sm font-semibold text-zinc-900">{EMAIL_BLOCK_KIND_LABELS[selectedBlock.kind]}</div>
                <div className="mt-1 text-xs text-zinc-500">Выбранный блок письма</div>
              </div>

              <label className="block text-xs font-medium text-zinc-700">
                Тип блока
                <select
                  value={selectedBlock.kind}
                  onChange={(event) => updateBlockKind(selectedBlock.id, event.target.value as EmailBuilderBlockKind)}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
                >
                  {EMAIL_BLOCK_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="mb-2 text-xs font-medium text-zinc-700">Фон блока</div>
                <div className="grid grid-cols-3 gap-2">
                  {EMAIL_BLOCK_BACKGROUNDS.map((background) => (
                    <button
                      key={background.value}
                      type="button"
                      title={background.label}
                      onClick={() => updateBlockBackground(selectedBlock.id, background.value)}
                      className={`flex h-10 items-center justify-center rounded-xl border text-xs font-medium transition ${
                        selectedBlock.backgroundColor === background.value
                          ? "border-teal-500 ring-2 ring-teal-100"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-md border border-zinc-300"
                        style={{ background: background.swatch }}
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <label className="block text-xs font-medium text-zinc-700">
                    Произвольный цвет
                    <div className="mt-1 grid grid-cols-[44px_minmax(0,1fr)] gap-2">
                      <input
                        type="color"
                        value={isEmailHexColor(customBackgroundDraft) ? customBackgroundDraft : "#ffffff"}
                        onChange={(event) => updateCustomBlockBackground(selectedBlock.id, event.target.value)}
                        className="h-10 w-11 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
                        aria-label="Выбрать произвольный цвет фона"
                      />
                      <input
                        value={customBackgroundDraft}
                        onChange={(event) => updateCustomBlockBackground(selectedBlock.id, event.target.value)}
                        onBlur={() => {
                          if (!isEmailHexColor(customBackgroundDraft)) {
                            setCustomBackgroundDraft(
                              selectedBlock.backgroundColor === "transparent" ? "#ffffff" : selectedBlock.backgroundColor
                            );
                          }
                        }}
                        placeholder="#eef6ff"
                        className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
                      />
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => updateBlockBackground(selectedBlock.id, "transparent")}
                    className="text-left text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
                  >
                    Сбросить фон
                  </button>
                </div>
              </div>

              <label className="block text-xs font-medium text-zinc-700">
                Отступы внутри блока
                <select
                  value={selectedBlock.padding}
                  onChange={(event) => updateBlockPadding(selectedBlock.id, event.target.value as EmailBlockPadding)}
                  className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
                >
                  {EMAIL_BLOCK_PADDINGS.map((padding) => (
                    <option key={padding.value} value={padding.value}>
                      {padding.label}
                    </option>
                  ))}
                </select>
              </label>

              {selectedBlock.kind === "image" && selectedImageSettings ? (
                <div className="grid gap-3">
                  <label className="block text-xs font-medium text-zinc-700">
                    Ссылка на картинку
                    <input
                      value={selectedImageSettings.src}
                      onChange={(event) =>
                        updateImageSettings(selectedBlock.id, {
                          ...selectedImageSettings,
                          src: event.target.value,
                        })
                      }
                      placeholder="https://example.com/banner.png"
                      className="mt-1 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs font-medium text-zinc-700">
                    Alt-текст
                    <input
                      value={selectedImageSettings.alt}
                      onChange={(event) =>
                        updateImageSettings(selectedBlock.id, {
                          ...selectedImageSettings,
                          alt: event.target.value,
                        })
                      }
                      placeholder="Описание изображения"
                      className="mt-1 h-10 w-full rounded-xl border border-zinc-300 px-3 text-sm text-zinc-900 outline-none ring-teal-500 focus:ring-2"
                    />
                  </label>
                  <label className="block text-xs font-medium text-zinc-700">
                    Ширина: {selectedImageSettings.width}%
                    <input
                      type="range"
                      min="25"
                      max="100"
                      step="5"
                      value={selectedImageSettings.width}
                      onChange={(event) =>
                        updateImageSettings(selectedBlock.id, {
                          ...selectedImageSettings,
                          width: Number(event.target.value),
                        })
                      }
                      className="mt-2 w-full accent-teal-600"
                    />
                  </label>
                </div>
              ) : (
                <label className="block text-xs font-medium text-zinc-700">
                  Содержимое
                  <textarea
                    rows={10}
                    value={blockTextFromHtml(selectedBlock.html)}
                    onChange={(event) => updateBlockText(selectedBlock.id, event.target.value)}
                    placeholder={EMAIL_BLOCK_PLACEHOLDERS[selectedBlock.kind]}
                    className="mt-1 w-full resize-y rounded-xl border border-zinc-300 px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none ring-teal-500 focus:ring-2"
                  />
                </label>
              )}

              {selectedBlock.kind !== "image" ? (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-zinc-700">Переменные</div>
                    <div className="text-[11px] text-zinc-500">Нажмите, чтобы вставить</div>
                  </div>
                  <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                    {TEMPLATE_VARIABLES.map((item) => (
                      <button
                        key={item.token}
                        type="button"
                        title={`${item.label}: ${item.description}`}
                        onClick={() => appendVariableToSelectedBlock(item.token)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition hover:border-teal-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <span className="flex min-w-0 items-start justify-between gap-2">
                          <span className="min-w-0 text-xs font-semibold text-zinc-900">{item.label}</span>
                          <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-200">
                            {item.token}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] font-normal leading-snug text-zinc-500">
                          {item.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
              Выберите блок
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TemplateDialogHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h4 id="emailTemplateDialogTitle" className="text-lg font-semibold text-zinc-950">
          {title}
        </h4>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

function TemplateDialogFooter({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        Готово
      </button>
    </div>
  );
}
