const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "h2",
  "h3",
  "blockquote",
  "figure",
  "img",
]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function readHtmlAttribute(rawAttrs: string, name: string) {
  const match = rawAttrs.match(new RegExp("\\s" + name + "\\s*=\\s*(\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s>]+))", "i"));
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? "";
}

function sanitizeDataColor(value: string) {
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : "";
}

function sanitizeDataPadding(value: string) {
  return ["none", "small", "medium", "large"].includes(value) ? value : "";
}

function sanitizeImageWidth(value: string) {
  const width = Number(value);
  if (!Number.isInteger(width) || width < 25 || width > 100) return "100";
  return String(width);
}

function decodeEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function isSafeHref(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("/") ||
    normalized.startsWith("#")
  );
}

function isSafeImageSrc(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("/");
}

function plainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function normalizeInput(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<div(?:\s[^>]*)?>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>")
    .replace(/<(?:section|article|header|footer)(?:\s[^>]*)?>/gi, "<p>")
    .replace(/<\/(?:section|article|header|footer)>/gi, "</p>");
}

export function sanitizeRichTextHtml(value: string | null | undefined) {
  if (!value?.trim()) return null;

  const normalized = normalizeInput(value.trim());
  const containsHtml = /<\/?[a-z][^>]*>/i.test(normalized);
  if (!containsHtml) {
    return plainTextToHtml(normalized);
  }

  let sanitized = normalized
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*\/?>/gi, "");

  sanitized = sanitized.replace(/<(\/?)([a-z0-9-]+)([^>]*)>/gi, (_match, slash: string, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return "";
    }

    if (slash) {
      return tag === "img" || tag === "br" ? "" : `</${tag}>`;
    }

    if (tag === "br") {
      return "<br>";
    }

    if (tag === "a") {
      const hrefValue = readHtmlAttribute(rawAttrs, "href");
      if (!hrefValue || !isSafeHref(hrefValue)) {
        return "<a>";
      }
      return `<a href="${escapeAttribute(hrefValue)}" target="_blank" rel="noreferrer">`;
    }

    if (tag === "figure") {
      const attributes: string[] = [];
      const kind = readHtmlAttribute(rawAttrs, "data-kind");
      const background = sanitizeDataColor(readHtmlAttribute(rawAttrs, "data-bg"));
      const padding = sanitizeDataPadding(readHtmlAttribute(rawAttrs, "data-pad"));

      if (kind === "image") attributes.push('data-kind="image"');
      if (background) attributes.push(`data-bg="${background}"`);
      if (padding) attributes.push(`data-pad="${padding}"`);

      return attributes.length ? `<figure ${attributes.join(" ")}>` : "<figure>";
    }

    if (tag === "img") {
      const src = readHtmlAttribute(rawAttrs, "src");
      if (!src || !isSafeImageSrc(src)) return "";

      const alt = readHtmlAttribute(rawAttrs, "alt");
      const width = sanitizeImageWidth(readHtmlAttribute(rawAttrs, "data-width") || readHtmlAttribute(rawAttrs, "width"));
      return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" data-width="${width}">`;
    }

    return `<${tag}>`;
  });

  sanitized = sanitized
    .replace(/<(p|h2|h3|blockquote)>\s*<\/\1>/gi, "")
    .replace(/<p><br><\/p>/gi, "")
    .trim();

  return extractRichTextText(sanitized) || /<img\b/i.test(sanitized) ? sanitized : null;
}

export function extractRichTextText(value: string | null | undefined) {
  if (!value) return "";

  const withBreaks = value
    .replace(/<img[^>]*\salt="([^"]*)"[^>]*>/gi, " $1 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|blockquote|figure|li)>/gi, "\n")
    .replace(/<(li)>/gi, "- ");

  return decodeEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasMeaningfulRichText(value: string | null | undefined) {
  return extractRichTextText(value).length > 0;
}

export function normalizeRichTextForEditor(value: string | null | undefined) {
  return sanitizeRichTextHtml(value) ?? "<p></p>";
}

export function getRichTextPreviewText(value: string | null | undefined) {
  return extractRichTextText(sanitizeRichTextHtml(value));
}
