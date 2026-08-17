import { buildEmailGreeting, escapeHtml, renderMultilineHtml } from "@/lib/email/template-format";

type CourseBroadcastTemplateInput = {
  recipientName?: string | null;
  courseTitle: string;
  courseUrl: string;
  messageSubject: string;
  messageBody: string;
  groupName?: string | null;
};

export function buildCourseBroadcastEmailTemplate(input: CourseBroadcastTemplateInput) {
  const safeCourseTitle = escapeHtml(input.courseTitle);
  const safeCourseUrl = escapeHtml(input.courseUrl);
  const safeGroupName = input.groupName ? escapeHtml(input.groupName) : null;
  const greeting = buildEmailGreeting(input.recipientName, escapeHtml);
  const subject = input.messageSubject.trim();
  const lead = safeGroupName
    ? `HR отправил сообщение ученикам группы «${safeGroupName}» по курсу «${safeCourseTitle}».`
    : `HR отправил сообщение ученикам по курсу «${safeCourseTitle}».`;

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d7dde6;border-radius:8px;font-family:Arial,sans-serif;color:#1f2937;">
        <tr>
          <td style="padding:24px 28px 12px 28px;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">${greeting}</p>
            <p style="margin:0 0 16px 0;font-size:28px;line-height:1.35;">${escapeHtml(subject)}</p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">${lead}</p>
            <div style="margin:0 0 20px 0;padding:16px 18px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:16px;line-height:1.55;">
              ${renderMultilineHtml(input.messageBody)}
            </div>
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
    `${subject}\n\n` +
    `${safeGroupName
      ? `HR отправил сообщение ученикам группы «${input.groupName}» по курсу «${input.courseTitle}».`
      : `HR отправил сообщение ученикам по курсу «${input.courseTitle}».`}\n\n` +
    `${input.messageBody}\n\n` +
    `Открыть курс:\n${input.courseUrl}\n\n` +
    `Пожалуйста, не отвечайте на это автоматическое сообщение.`;

  return { subject, html, text };
}
