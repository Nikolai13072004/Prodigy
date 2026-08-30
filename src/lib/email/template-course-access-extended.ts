import { buildEmailGreeting, escapeHtml } from "@/lib/email/template-format";

type CourseAccessExtendedTemplateInput = {
  recipientName?: string | null;
  courseTitle: string;
  courseUrl: string;
  previousAccessLabel: string;
  nextAccessLabel: string;
};

export function buildCourseAccessExtendedEmailTemplate(input: CourseAccessExtendedTemplateInput) {
  const safeCourseTitle = escapeHtml(input.courseTitle);
  const safeCourseUrl = escapeHtml(input.courseUrl);
  const safePreviousAccessLabel = escapeHtml(input.previousAccessLabel);
  const safeNextAccessLabel = escapeHtml(input.nextAccessLabel);
  const greeting = buildEmailGreeting(input.recipientName, escapeHtml);
  const subject = "Срок доступа к курсу обновлен";

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d7dde6;border-radius:8px;font-family:Arial,sans-serif;color:#1f2937;">
        <tr>
          <td style="padding:24px 28px 12px 28px;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">${greeting}</p>
            <p style="margin:0 0 16px 0;font-size:28px;line-height:1.35;">HR обновил доступ к курсу «${safeCourseTitle}».</p>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.45;">Было: <strong>${safePreviousAccessLabel}</strong></p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">Стало: <strong>${safeNextAccessLabel}</strong></p>
            <p style="margin:0 0 8px 0;font-size:16px;line-height:1.45;">Открыть курс:</p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.45;">
              <a href="${safeCourseUrl}" style="color:#0b5cab;text-decoration:none;">${safeCourseUrl}</a>
            </p>
            <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.45;">Пожалуйста, не отвечайте на это автоматическое сообщение.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

  const text =
    `${buildEmailGreeting(input.recipientName)}\n\n` +
    `HR обновил доступ к курсу «${input.courseTitle}».\n` +
    `Было: ${input.previousAccessLabel}\n` +
    `Стало: ${input.nextAccessLabel}\n\n` +
    `Открыть курс:\n${input.courseUrl}\n\n` +
    `Пожалуйста, не отвечайте на это автоматическое сообщение.`;

  return { subject, html, text };
}
