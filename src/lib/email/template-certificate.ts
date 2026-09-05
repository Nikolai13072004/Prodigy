import {
  DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  renderPlatformHtmlEmailTemplate,
  type PlatformHtmlEmailTemplate,
} from "@/lib/email/template-settings";

type CertificateTemplateInput = {
  recipientName?: string | null;
  recipientFirstName?: string | null;
  courseTitle: string;
  courseUrl: string;
  certificateUrl: string;
  certificateSerial: string;
  issuedAt?: Date | string | null;
  template?: PlatformHtmlEmailTemplate;
};

export function buildCertificateEmailTemplate(input: CertificateTemplateInput) {
  const template = input.template ?? DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
  const fullName = input.recipientName?.trim() || "Пользователь";
  const firstName = input.recipientFirstName?.trim() || fullName.split(/\s+/)[0] || fullName;

  // Передаём ВЕСЬ набор переменных, а не только токены дефолтного шаблона: админ мог
  // дописать любой токен из справочника, а незаданный ключ остался бы как {{...}}.
  return renderPlatformHtmlEmailTemplate(template, {
    firstName,
    fullName,
    userName: firstName,
    courseTitle: input.courseTitle,
    courseUrl: input.courseUrl,
    certificateUrl: input.certificateUrl,
    certificateSerial: input.certificateSerial,
    certificateIssuedAt: formatCertificateIssuedAt(input.issuedAt),
  });
}

function formatCertificateIssuedAt(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
