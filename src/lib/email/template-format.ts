export function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatHoursLabel(hours: number) {
  const safeHours = Math.max(1, Math.trunc(hours));
  const mod10 = safeHours % 10;
  const mod100 = safeHours % 100;
  const unit = mod10 === 1 && mod100 !== 11 ? "час" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "часа" : "часов";

  return `${safeHours} ${unit}`;
}

export function emailGreetingName(input: string | null | undefined) {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function buildEmailGreeting(
  input: string | null | undefined,
  formatName: (name: string) => string = (name) => name,
) {
  const name = input?.trim();
  return name ? `Здравствуйте, ${formatName(name)}!` : "Здравствуйте!";
}

export function renderMultilineHtml(input: string) {
  return escapeHtml(input).replaceAll("\n", "<br />");
}
