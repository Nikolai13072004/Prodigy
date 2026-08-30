export const DEFAULT_PLATFORM_TIME_ZONE = "Europe/Moscow";
export const DEFAULT_PLATFORM_DATE_FORMAT = "DD.MM.YYYY";
export const DEFAULT_PLATFORM_TIME_FORMAT = "24H";

export const PLATFORM_TIME_ZONES = [
  { value: "Europe/Moscow", label: "Москва (Europe/Moscow)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/Berlin", label: "Берлин (Europe/Berlin)" },
  { value: "Asia/Almaty", label: "Алматы (Asia/Almaty)" },
  { value: "Asia/Tashkent", label: "Ташкент (Asia/Tashkent)" },
  { value: "Asia/Dubai", label: "Дубай (Asia/Dubai)" },
  { value: "America/New_York", label: "Нью-Йорк (America/New_York)" },
] as const;

export const PLATFORM_DATE_FORMATS = [
  { value: "DD.MM.YYYY", label: "ДД.ММ.ГГГГ" },
  { value: "YYYY-MM-DD", label: "ГГГГ-ММ-ДД" },
  { value: "MM/DD/YYYY", label: "ММ/ДД/ГГГГ" },
] as const;

export const PLATFORM_TIME_FORMATS = [
  { value: "24H", label: "24 часа" },
  { value: "12H", label: "12 часов (AM/PM)" },
] as const;

export type PlatformTimeZone = (typeof PLATFORM_TIME_ZONES)[number]["value"];
export type PlatformDateFormat = (typeof PLATFORM_DATE_FORMATS)[number]["value"];
export type PlatformTimeFormat = (typeof PLATFORM_TIME_FORMATS)[number]["value"];

function formatPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function isPlatformDateFormat(value: string): value is PlatformDateFormat {
  return PLATFORM_DATE_FORMATS.some((format) => format.value === value);
}

export function isPlatformTimeFormat(value: string): value is PlatformTimeFormat {
  return PLATFORM_TIME_FORMATS.some((format) => format.value === value);
}

export function isSupportedPlatformTimeZone(value: string): value is PlatformTimeZone {
  return PLATFORM_TIME_ZONES.some((timezone) => timezone.value === value);
}

export function formatPlatformPreviewDateTime(input: Date, config: {
  timeZone: string;
  dateFormat: PlatformDateFormat;
  timeFormat: PlatformTimeFormat;
}) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: config.timeFormat === "12H",
  }).formatToParts(input);

  const year = formatPart(parts, "year");
  const month = formatPart(parts, "month");
  const day = formatPart(parts, "day");
  const hour = formatPart(parts, "hour");
  const minute = formatPart(parts, "minute");
  const dayPeriod = formatPart(parts, "dayPeriod").toUpperCase();

  const dateValue =
    config.dateFormat === "YYYY-MM-DD"
      ? `${year}-${month}-${day}`
      : config.dateFormat === "MM/DD/YYYY"
        ? `${month}/${day}/${year}`
        : `${day}.${month}.${year}`;

  const timeValue = config.timeFormat === "12H" && dayPeriod ? `${hour}:${minute} ${dayPeriod}` : `${hour}:${minute}`;

  return `${dateValue} ${timeValue}`;
}
