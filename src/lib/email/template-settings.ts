import {
  normalizeRichTextForEditor,
  sanitizeRichTextHtml,
} from "@/lib/rich-text";

export type PlatformHtmlEmailTemplate = {
  subject: string;
  html: string;
  text: string;
  editorHtml: string;
};

export type PlatformEmailTemplateVariables = Record<string, string | null | undefined>;

type LegacyManagedEmailTemplate = {
  subject?: string | null;
  heading?: string | null;
  body?: string | null;
  footer?: string | null;
};

const DEFAULT_WELCOME_EMAIL_EDITOR_HTML =
  "<p>Здравствуйте, {{firstName}}!</p>" +
  "<h2>Для вас открыт доступ к корпоративной системе обучения.</h2>" +
  "<p>Используйте данные ниже для входа и активации доступа.</p>" +
  "<p><strong>Логин:</strong> {{login}}</p>" +
  "<p><strong>Пароль:</strong> {{passwordInstruction}}</p>" +
  "<p>Перейдите по ссылке:<br>{{accessUrl}}</p>" +
  "<p>Ссылка действует {{linkTtlHoursLabel}}.</p>" +
  "<p>Если вы не ожидали это письмо, свяжитесь с администратором платформы.</p>";

const DEFAULT_PASSWORD_RESET_EMAIL_EDITOR_HTML =
  "<p>Здравствуйте, {{firstName}}!</p>" +
  "<h2>Для вашего аккаунта подготовлен новый временный пароль.</h2>" +
  "<p><strong>Логин:</strong> {{login}}</p>" +
  "<p><strong>Временный пароль:</strong> {{temporaryPassword}}</p>" +
  "<p>Войти в систему:<br>{{loginUrl}}</p>" +
  "<p>Если вы не запрашивали сброс пароля, свяжитесь с администратором платформы.</p>";

const DEFAULT_CERTIFICATE_EMAIL_EDITOR_HTML =
  "<p>Здравствуйте, {{firstName}}!</p>" +
  "<h2>Ваш сертификат готов.</h2>" +
  "<p>Поздравляем с успешным завершением обучения по курсу «{{courseTitle}}».</p>" +
  "<p>Скачать сертификат:<br>{{certificateUrl}}</p>" +
  "<p>Если сертификат не открывается или в письме есть ошибка, свяжитесь с администратором платформы.</p>";

const DEFAULT_COURSE_ASSIGNED_EMAIL_EDITOR_HTML =
  "<p>Здравствуйте, {{firstName}}!</p>" +
  "<p>Вам назначен курс «{{courseTitle}}».</p>" +
  "<p>{{accessDeadline}}</p>" +
  "<p>Чтобы пройти курс, перейдите по ссылке:<br>{{courseUrl}}</p>" +
  "<p>Пожалуйста, не отвечайте на это автоматическое сообщение.</p>";

const URL_VARIABLES = [
  "accessUrl",
  "activationUrl",
  "certificateUrl",
  "courseUrl",
  "loginUrl",
  "resetUrl",
] as const;

function escapeEmailTemplateHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeEmailTemplateText(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function linkUrlVariables(html: string) {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;

      return URL_VARIABLES.reduce(
        (current, variable) =>
          current.replaceAll(
            `{{${variable}}}`,
            `<a href="{{${variable}}}" style="color:#0563c1;text-decoration:none;word-break:break-word;">{{${variable}}}</a>`
          ),
        part
      );
    })
    .join("");
}


function readEmailHtmlAttribute(rawAttrs: string, name: string) {
  const match = rawAttrs.match(new RegExp("\\s" + name + "\\s*=\\s*(\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s>]+))", "i"));
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? "";
}

function emailBlockBackground(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "transparent";
}

function emailBlockPadding(value: string) {
  switch (value) {
    case "small":
      return 12;
    case "medium":
      return 20;
    case "large":
      return 28;
    default:
      return 0;
  }
}

function emailImageWidth(value: string) {
  const width = Number(value);
  if (!Number.isInteger(width) || width < 25 || width > 100) return 100;
  return width;
}

function styleEmailImageTags(html: string) {
  return html.replace(/<img([^>]*)>/gi, (_match, rawAttrs: string) => {
    const src = readEmailHtmlAttribute(rawAttrs, "src");
    const alt = readEmailHtmlAttribute(rawAttrs, "alt");
    const width = emailImageWidth(readEmailHtmlAttribute(rawAttrs, "data-width") || readEmailHtmlAttribute(rawAttrs, "width"));

    if (!src) return "";

    return `<img src="${src}" alt="${escapeEmailTemplateHtml(alt)}" style="display:block;width:${width}%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`;
  });
}

function styleEmailFigureTags(html: string) {
  return html
    .replace(/<figure([^>]*)>/gi, (_match, rawAttrs: string) => {
      const background = emailBlockBackground(readEmailHtmlAttribute(rawAttrs, "data-bg"));
      const padding = emailBlockPadding(readEmailHtmlAttribute(rawAttrs, "data-pad"));
      const backgroundStyle = background === "transparent" ? "" : `background:${background};border-radius:12px;`;
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;"><tr><td style="${backgroundStyle}padding:${padding}px;">`;
    })
    .replace(/<\/figure>/gi, "</td></tr></table>");
}
function renderEmailTextLine(line: string) {
  return linkUrlVariables(escapeEmailTemplateHtml(line));
}

function styleRichEmailContent(html: string) {
  const styled = html
    .replace(/<p>/g, '<p style="margin:0 0 32px 0;font-size:16px;line-height:1.38;color:#3d4651;">')
    .replace(/<h2>/g, '<p style="margin:0 0 24px 0;font-size:22px;line-height:1.28;font-weight:700;color:#24313f;">')
    .replace(/<\/h2>/g, "</p>")
    .replace(/<h3>/g, '<p style="margin:0 0 20px 0;font-size:18px;line-height:1.32;font-weight:700;color:#24313f;">')
    .replace(/<\/h3>/g, "</p>")
    .replace(
      /<blockquote>/g,
      '<blockquote style="margin:0 0 28px 0;padding:0 0 0 16px;border-left:3px solid #cfd6de;color:#536170;font-size:16px;line-height:1.45;">'
    )
    .replace(/<ul>/g, '<ul style="margin:0 0 28px 22px;padding:0;font-size:16px;line-height:1.45;color:#3d4651;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 28px 22px;padding:0;font-size:16px;line-height:1.45;color:#3d4651;">')
    .replace(/<li>/g, '<li style="margin:0 0 8px 0;">')
    .replace(/<a href="([^"]*)"[^>]*>/g, '<a href="$1" style="color:#0563c1;text-decoration:none;word-break:break-word;">');

  return linkUrlVariables(styleEmailFigureTags(styleEmailImageTags(styled)));
}

export function buildPlainTextEmailFromRichHtml(editorHtml: string) {
  const sanitized = sanitizeRichTextHtml(editorHtml);
  if (!sanitized) return "";

  return decodeEmailTemplateText(
    sanitized
      .replace(/<img[^>]*\salt="([^"]*)"[^>]*>/gi, "$1\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<\/(p|h2|h3|blockquote|figure|li)>/gi, "\n")
      .replace(/<\/(ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildRichEmailEditorHtmlFromText(text: string) {
  return normalizeRichTextForEditor(text);
}

export function buildPlatformHtmlEmailFromRichHtml(editorHtml: string) {
  const content = styleRichEmailContent(sanitizeRichTextHtml(editorHtml) ?? "<p></p>");

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e4e8ed;">
  <tr>
    <td align="center" style="padding:32px 16px 40px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#3d4651;">
        <tr>
          <td style="padding:64px 34px 58px 34px;">
            ${content}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

function renderEmailTextBlock(block: string) {
  return block
    .split("\n")
    .map((line) => renderEmailTextLine(line))
    .join("<br />");
}

export function buildPlatformHtmlEmailFromText(text: string) {
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const editorHtml = blocks.map((block) => `<p>${renderEmailTextBlock(block)}</p>`).join("");
  return buildPlatformHtmlEmailFromRichHtml(editorHtml);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPlatformEditorHtmlFromMultilineText(value: string) {
  return value
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split("\n").map(escapeEmailTemplateHtml).join("<br />")}</p>`)
    .join("");
}

function replaceFirstHeading(editorHtml: string, replacement: string) {
  if (!replacement) return editorHtml;
  if (/<h2>[\s\S]*?<\/h2>/i.test(editorHtml)) {
    return editorHtml.replace(/<h2>[\s\S]*?<\/h2>/i, replacement);
  }
  return `${replacement}${editorHtml}`;
}

function replaceParagraphAfterFirstHeading(editorHtml: string, replacement: string) {
  if (!replacement) return editorHtml;

  const headingMatch = editorHtml.match(/<h2>[\s\S]*?<\/h2>/i);
  if (headingMatch?.index == null) {
    return `${replacement}${editorHtml}`;
  }

  const afterHeadingIndex = headingMatch.index + headingMatch[0].length;
  const afterHeading = editorHtml.slice(afterHeadingIndex);
  const paragraphMatch = afterHeading.match(/<p>[\s\S]*?<\/p>/i);
  if (paragraphMatch?.index == null) {
    return `${editorHtml.slice(0, afterHeadingIndex)}${replacement}${afterHeading}`;
  }

  const paragraphStart = afterHeadingIndex + paragraphMatch.index;
  const paragraphEnd = paragraphStart + paragraphMatch[0].length;
  return `${editorHtml.slice(0, paragraphStart)}${replacement}${editorHtml.slice(paragraphEnd)}`;
}

function replaceLastParagraph(editorHtml: string, replacement: string) {
  const matches = Array.from(editorHtml.matchAll(/<p>[\s\S]*?<\/p>/gi));
  const last = matches.at(-1);
  if (last?.index == null) return replacement ? `${editorHtml}${replacement}` : editorHtml;

  return `${editorHtml.slice(0, last.index)}${replacement}${editorHtml.slice(last.index + last[0].length)}`;
}

function legacyManagedEditorHtml(
  input: Partial<PlatformHtmlEmailTemplate & LegacyManagedEmailTemplate> | null | undefined,
  fallback: PlatformHtmlEmailTemplate
) {
  if (!input) return "";

  const heading = asTrimmedString(input.heading);
  const body = asTrimmedString(input.body);
  const footer = asTrimmedString(input.footer);

  if (!heading && !body && !footer) return "";

  let editorHtml = fallback.editorHtml || buildRichEmailEditorHtmlFromText(fallback.text);
  if (heading) {
    editorHtml = replaceFirstHeading(editorHtml, `<h2>${escapeEmailTemplateHtml(heading)}</h2>`);
  }
  if (body) {
    editorHtml = replaceParagraphAfterFirstHeading(editorHtml, buildPlatformEditorHtmlFromMultilineText(body));
  }
  if (typeof input.footer === "string") {
    editorHtml = replaceLastParagraph(editorHtml, footer ? buildPlatformEditorHtmlFromMultilineText(footer) : "");
  }

  return normalizeRichTextForEditor(editorHtml);
}

export function normalizePlatformHtmlEmailTemplate(
  input: Partial<PlatformHtmlEmailTemplate> | null | undefined,
  fallback: PlatformHtmlEmailTemplate
): PlatformHtmlEmailTemplate {
  const legacyInput = input as Partial<PlatformHtmlEmailTemplate & LegacyManagedEmailTemplate> | null | undefined;
  const subject = asTrimmedString(input?.subject) || fallback.subject;
  const fallbackEditorHtml = fallback.editorHtml || buildRichEmailEditorHtmlFromText(fallback.text);
  const editorHtml = normalizeRichTextForEditor(
    input?.editorHtml || legacyManagedEditorHtml(legacyInput, fallback) || input?.text || fallbackEditorHtml
  );
  const text = buildPlainTextEmailFromRichHtml(editorHtml) || fallback.text;

  return {
    subject,
    editorHtml,
    html: buildPlatformHtmlEmailFromRichHtml(editorHtml),
    text,
  };
}

export function renderPlatformHtmlEmailTemplate(
  template: PlatformHtmlEmailTemplate,
  variables: PlatformEmailTemplateVariables
) {
  return {
    subject: replaceTemplateVariables(template.subject, variables, (value) => value),
    html: replaceTemplateVariables(template.html, variables, escapeEmailTemplateHtml),
    text: replaceTemplateVariables(template.text, variables, (value) => value),
  };
}

function replaceTemplateVariables(
  template: string,
  variables: PlatformEmailTemplateVariables,
  formatValue: (value: string) => string
) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (!(key in variables)) return match;
    const value = variables[key];
    return value == null ? "" : formatValue(String(value));
  });
}

export const DEFAULT_WELCOME_EMAIL_TEMPLATE = {
  subject: "Добро пожаловать на платформу обучения",
  editorHtml: DEFAULT_WELCOME_EMAIL_EDITOR_HTML,
  html: buildPlatformHtmlEmailFromRichHtml(DEFAULT_WELCOME_EMAIL_EDITOR_HTML),
  text: buildPlainTextEmailFromRichHtml(DEFAULT_WELCOME_EMAIL_EDITOR_HTML),
} as const satisfies PlatformHtmlEmailTemplate;

export const DEFAULT_PASSWORD_RESET_EMAIL_TEMPLATE = {
  subject: "Для вас подготовлен новый временный пароль",
  editorHtml: DEFAULT_PASSWORD_RESET_EMAIL_EDITOR_HTML,
  html: buildPlatformHtmlEmailFromRichHtml(DEFAULT_PASSWORD_RESET_EMAIL_EDITOR_HTML),
  text: buildPlainTextEmailFromRichHtml(DEFAULT_PASSWORD_RESET_EMAIL_EDITOR_HTML),
} as const satisfies PlatformHtmlEmailTemplate;

export const DEFAULT_CERTIFICATE_EMAIL_TEMPLATE = {
  subject: "Ваш сертификат готов",
  editorHtml: DEFAULT_CERTIFICATE_EMAIL_EDITOR_HTML,
  html: buildPlatformHtmlEmailFromRichHtml(DEFAULT_CERTIFICATE_EMAIL_EDITOR_HTML),
  text: buildPlainTextEmailFromRichHtml(DEFAULT_CERTIFICATE_EMAIL_EDITOR_HTML),
} as const satisfies PlatformHtmlEmailTemplate;

export const DEFAULT_COURSE_ASSIGNED_EMAIL_TEMPLATE = {
  subject: "У вас появились новые курсы",
  editorHtml: DEFAULT_COURSE_ASSIGNED_EMAIL_EDITOR_HTML,
  html: buildPlatformHtmlEmailFromRichHtml(DEFAULT_COURSE_ASSIGNED_EMAIL_EDITOR_HTML),
  text: buildPlainTextEmailFromRichHtml(DEFAULT_COURSE_ASSIGNED_EMAIL_EDITOR_HTML),
} as const satisfies PlatformHtmlEmailTemplate;

export const DEFAULT_PLATFORM_EMAIL_TEMPLATES = {
  welcome: DEFAULT_WELCOME_EMAIL_TEMPLATE,
  passwordReset: DEFAULT_PASSWORD_RESET_EMAIL_TEMPLATE,
  certificate: DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
} as const satisfies Record<string, PlatformHtmlEmailTemplate>;

export function parsePlatformHtmlEmailTemplateJson(
  value: string | null | undefined,
  fallback: PlatformHtmlEmailTemplate
) {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value) as Partial<PlatformHtmlEmailTemplate>;
    return normalizePlatformHtmlEmailTemplate(parsed, fallback);
  } catch {
    return fallback;
  }
}

export function serializePlatformHtmlEmailTemplate(template: PlatformHtmlEmailTemplate) {
  return JSON.stringify(template);
}
