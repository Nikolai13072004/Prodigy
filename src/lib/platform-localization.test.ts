import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPlatformPreviewDateTime,
  isPlatformDateFormat,
  isPlatformTimeFormat,
  isSupportedPlatformTimeZone,
} from "./platform-localization";

// Настройки локали платформы: часовой пояс, формат даты и времени.

test("предикаты допустимых значений", () => {
  assert.equal(isPlatformDateFormat("DD.MM.YYYY"), true);
  assert.equal(isPlatformDateFormat("YYYY-MM-DD"), true);
  assert.equal(isPlatformDateFormat("DD/MM/YYYY"), false);
  assert.equal(isPlatformTimeFormat("24H"), true);
  assert.equal(isPlatformTimeFormat("12H"), true);
  assert.equal(isPlatformTimeFormat("48H"), false);
  assert.equal(isSupportedPlatformTimeZone("Europe/Moscow"), true);
  assert.equal(isSupportedPlatformTimeZone("UTC"), true);
  assert.equal(isSupportedPlatformTimeZone("Mars/Olympus"), false);
});

// 15 марта 2026, 09:05 UTC — фиксированный момент для детерминизма.
const MOMENT = new Date(Date.UTC(2026, 2, 15, 9, 5));

test("форматы даты в UTC, 24 часа", () => {
  assert.equal(
    formatPlatformPreviewDateTime(MOMENT, { timeZone: "UTC", dateFormat: "DD.MM.YYYY", timeFormat: "24H" }),
    "15.03.2026 09:05"
  );
  assert.equal(
    formatPlatformPreviewDateTime(MOMENT, { timeZone: "UTC", dateFormat: "YYYY-MM-DD", timeFormat: "24H" }),
    "2026-03-15 09:05"
  );
  assert.equal(
    formatPlatformPreviewDateTime(MOMENT, { timeZone: "UTC", dateFormat: "MM/DD/YYYY", timeFormat: "24H" }),
    "03/15/2026 09:05"
  );
});

test("12-часовой формат добавляет AM/PM", () => {
  assert.equal(
    formatPlatformPreviewDateTime(MOMENT, { timeZone: "UTC", dateFormat: "DD.MM.YYYY", timeFormat: "12H" }),
    "15.03.2026 09:05 AM"
  );
  const evening = new Date(Date.UTC(2026, 2, 15, 20, 5));
  assert.equal(
    formatPlatformPreviewDateTime(evening, { timeZone: "UTC", dateFormat: "DD.MM.YYYY", timeFormat: "12H" }),
    "15.03.2026 08:05 PM"
  );
});

test("часовой пояс сдвигает время", () => {
  // Москва = UTC+3 → 09:05 UTC становится 12:05
  assert.equal(
    formatPlatformPreviewDateTime(MOMENT, {
      timeZone: "Europe/Moscow",
      dateFormat: "DD.MM.YYYY",
      timeFormat: "24H",
    }),
    "15.03.2026 12:05"
  );
});
