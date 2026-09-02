// Общие date-форматтеры для дашбордов главной. Вынесены из page.tsx
// (god-component на 1454 строки, ADR-013 IA-B): используются и админ-обзором,
// и HR-дашбордом.

export function formatDateRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export function formatDateTimeRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
