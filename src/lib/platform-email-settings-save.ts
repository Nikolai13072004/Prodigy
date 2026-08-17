import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  buildPlainTextEmailFromRichHtml,
  buildPlatformHtmlEmailFromRichHtml,
  buildRichEmailEditorHtmlFromText,
  DEFAULT_COURSE_ASSIGNED_EMAIL_TEMPLATE,
  DEFAULT_PLATFORM_EMAIL_TEMPLATES,
  serializePlatformHtmlEmailTemplate,
  type PlatformHtmlEmailTemplate,
} from "@/lib/email/template-settings";
import prisma from "@/lib/prisma";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";

export type PlatformEmailSettingsActor = {
  id?: string | null;
  login?: string | null;
  name?: string | null;
};

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function asNullableString(formData: FormData, key: string) {
  const value = asString(formData, key);
  return value || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSmtpSettingsSource(value: string) {
  return value === "PLATFORM" ? "PLATFORM" : "ENV";
}

function parsePort(value: string) {
  if (!value) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP-порт должен быть числом от 1 до 65535.");
  }
  return port;
}

type LegacyEmailTemplateFields = {
  heading: string;
  body: string;
  footer: string;
};

function extractLegacyEmailTemplateFields(editorHtml: string): LegacyEmailTemplateFields {
  const headingMatch = editorHtml.match(/<h2>[\s\S]*?<\/h2>/i);
  const headingEnd = headingMatch?.index == null ? 0 : headingMatch.index + headingMatch[0].length;
  const paragraphMatches = Array.from(editorHtml.matchAll(/<p>[\s\S]*?<\/p>/gi));
  const bodyMatch = paragraphMatches.find((match) => (match.index ?? 0) >= headingEnd) ?? paragraphMatches[0];
  const footerMatch = paragraphMatches.at(-1);

  return {
    heading: buildPlainTextEmailFromRichHtml(headingMatch?.[0] ?? ""),
    body: buildPlainTextEmailFromRichHtml(bodyMatch?.[0] ?? ""),
    footer: buildPlainTextEmailFromRichHtml(footerMatch?.[0] ?? ""),
  };
}

function readHtmlEmailTemplate(
  formData: FormData,
  prefix: string,
  fallback: PlatformHtmlEmailTemplate
) {
  const fallbackEditorHtml = fallback.editorHtml || buildRichEmailEditorHtmlFromText(fallback.text);
  const editorHtml = asString(formData, `${prefix}EditorHtml`) || fallbackEditorHtml;
  const legacyFields = extractLegacyEmailTemplateFields(editorHtml);

  return {
    subject: asString(formData, `${prefix}Subject`) || fallback.subject,
    heading: asString(formData, `${prefix}Heading`) || legacyFields.heading,
    body: asString(formData, `${prefix}Body`) || legacyFields.body,
    footer: asString(formData, `${prefix}Footer`) || legacyFields.footer,
    editorHtml,
    html: buildPlatformHtmlEmailFromRichHtml(editorHtml),
    text: buildPlainTextEmailFromRichHtml(editorHtml) || fallback.text,
  };
}

function revalidatePlatformSettings() {
  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/maintenance");
  revalidatePath("/courses");
  revalidatePath("/admin/settings");
}

export async function saveEmailPlatformSettingsFromForm(
  formData: FormData,
  actor: PlatformEmailSettingsActor | null
) {
  const smtpSettingsSource = parseSmtpSettingsSource(asString(formData, "smtpSettingsSource"));
  const smtpHost = asNullableString(formData, "smtpHost");
  const smtpLogin = asNullableString(formData, "smtpLogin");
  const smtpPassword = asString(formData, "smtpPassword");
  const smtpFromEmail = asNullableString(formData, "smtpFromEmail");
  const smtpFromName = asNullableString(formData, "smtpFromName");
  const smtpEncryption = asString(formData, "smtpEncryption") || DEFAULT_PLATFORM_SETTINGS.smtpEncryption;
  const welcomeEmailTemplate = readHtmlEmailTemplate(
    formData,
    "welcome",
    DEFAULT_PLATFORM_EMAIL_TEMPLATES.welcome
  );
  const passwordResetEmailTemplate = readHtmlEmailTemplate(
    formData,
    "passwordReset",
    DEFAULT_PLATFORM_EMAIL_TEMPLATES.passwordReset
  );
  const certificateEmailTemplate = readHtmlEmailTemplate(
    formData,
    "certificate",
    DEFAULT_PLATFORM_EMAIL_TEMPLATES.certificate
  );
  const courseAssignedEmailTemplate = readHtmlEmailTemplate(
    formData,
    "courseAssigned",
    DEFAULT_COURSE_ASSIGNED_EMAIL_TEMPLATE
  );

  const smtpPort = parsePort(asString(formData, "smtpPort"));

  if (smtpFromEmail && !isValidEmail(smtpFromEmail)) {
    throw new Error("Укажите корректный email отправителя.");
  }

  if (!["TLS", "SSL", "NONE"].includes(smtpEncryption)) {
    throw new Error("Выберите корректный тип шифрования SMTP.");
  }

  const current = await prisma.platformSettings.findUnique({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    select: { smtpPassword: true },
  });

  await prisma.platformSettings.upsert({
    where: { id: DEFAULT_PLATFORM_SETTINGS.id },
    create: {
      id: DEFAULT_PLATFORM_SETTINGS.id,
      smtpSettingsSource,
      smtpHost,
      smtpPort,
      smtpEncryption,
      smtpLogin,
      smtpPassword: smtpPassword || null,
      smtpFromEmail,
      smtpFromName,
      welcomeEmailTemplateJson: serializePlatformHtmlEmailTemplate(welcomeEmailTemplate),
      passwordResetEmailTemplateJson: serializePlatformHtmlEmailTemplate(passwordResetEmailTemplate),
      certificateEmailTemplateJson: serializePlatformHtmlEmailTemplate(certificateEmailTemplate),
      courseAssignedEmailTemplateJson: serializePlatformHtmlEmailTemplate(courseAssignedEmailTemplate),
    },
    update: {
      smtpSettingsSource,
      smtpHost,
      smtpPort,
      smtpEncryption,
      smtpLogin,
      smtpPassword: smtpPassword || current?.smtpPassword || null,
      smtpFromEmail,
      smtpFromName,
      welcomeEmailTemplateJson: serializePlatformHtmlEmailTemplate(welcomeEmailTemplate),
      passwordResetEmailTemplateJson: serializePlatformHtmlEmailTemplate(passwordResetEmailTemplate),
      certificateEmailTemplateJson: serializePlatformHtmlEmailTemplate(certificateEmailTemplate),
      courseAssignedEmailTemplateJson: serializePlatformHtmlEmailTemplate(courseAssignedEmailTemplate),
    },
  });

  await recordAuditEvent({
    actor,
    action: "platform_settings:update_email",
    objectType: "platform_settings",
    objectId: DEFAULT_PLATFORM_SETTINGS.id,
    objectLabel: smtpFromName || smtpFromEmail || "Email settings",
    metadata: {
      smtpSettingsSource,
      smtpHost,
      smtpPort,
      smtpEncryption,
      smtpLogin,
      smtpFromEmail,
      smtpFromName,
      passwordUpdated: Boolean(smtpPassword),
      templateSubjects: {
        welcome: welcomeEmailTemplate.subject,
        passwordReset: passwordResetEmailTemplate.subject,
        certificate: certificateEmailTemplate.subject,
        courseAssigned: courseAssignedEmailTemplate.subject,
      },
    },
  });

  revalidatePlatformSettings();
}
