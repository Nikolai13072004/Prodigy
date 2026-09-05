import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCertificateEmailTemplate } from "./template-certificate";
import type { PlatformHtmlEmailTemplate } from "./template-settings";

// Письмо о выдаче сертификата: подстановка переменных, фолбэк на дефолт,
// кастомный шаблон администратора и ссылка на сертификат.

const INPUT = {
  recipientName: "Иван Петров",
  recipientFirstName: "Иван",
  courseTitle: "Основы финансов",
  courseUrl: "https://lms.example/courses/1",
  certificateUrl: "https://lms.example/certificates/abc123",
  certificateSerial: "abc123",
  issuedAt: new Date("2026-08-25T10:00:00Z"),
};

test("дефолтный шаблон: все токены раскрыты, ссылка на сертификат присутствует", () => {
  const result = buildCertificateEmailTemplate(INPUT);
  for (const part of [result.subject, result.html, result.text]) {
    assert.doesNotMatch(part, /\{\{/, "не осталось нераскрытых токенов");
  }
  assert.match(result.html, /Основы финансов/, "название курса");
  assert.match(result.html, /Иван/, "имя");
  assert.match(result.html, /https:\/\/lms\.example\/certificates\/abc123/, "ссылка на сертификат");
});

test("фолбэк на дефолтный шаблон, когда шаблон не задан", () => {
  const result = buildCertificateEmailTemplate({ ...INPUT, template: undefined });
  assert.equal(result.subject, "Ваш сертификат готов");
});

test("кастомный шаблон администратора подставляет свои токены", () => {
  const custom: PlatformHtmlEmailTemplate = {
    subject: "Готово, {{fullName}}!",
    editorHtml: "<p>{{fullName}} — {{certificateSerial}} от {{certificateIssuedAt}}</p>",
    html: "<p>{{fullName}} — {{certificateSerial}} от {{certificateIssuedAt}}</p>",
    text: "{{fullName}} {{certificateSerial}} {{certificateIssuedAt}}",
  };
  const result = buildCertificateEmailTemplate({ ...INPUT, template: custom });
  assert.equal(result.subject, "Готово, Иван Петров!");
  assert.match(result.html, /abc123/, "серийник подставлен");
  assert.match(result.html, /2026/, "дата выдачи подставлена");
  assert.doesNotMatch(result.html, /\{\{/);
});
