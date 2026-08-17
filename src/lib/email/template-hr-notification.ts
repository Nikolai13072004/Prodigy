import { buildEmailGreeting } from "@/lib/email/template-format";

type HrNotificationTemplateInput = {
  recipientName?: string | null;
  notificationType: "course_completed" | "low_activity" | "access_expiring";
  learnerName: string;
  learnerLogin: string;
  courseTitle: string;
  courseUrl: string;
  lowActivityDays?: number | null;
  accessExpiresAtLabel?: string | null;
  accessExpiringDays?: number | null;
};

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildHrNotificationEmailTemplate(input: HrNotificationTemplateInput) {
  const safeLearnerName = escapeHtml(input.learnerName);
  const safeLearnerLogin = escapeHtml(input.learnerLogin);
  const safeCourseTitle = escapeHtml(input.courseTitle);
  const safeCourseUrl = escapeHtml(input.courseUrl);
  const htmlGreeting = buildEmailGreeting(input.recipientName, escapeHtml);
  const textGreeting = buildEmailGreeting(input.recipientName);

  const subject =
    input.notificationType === "course_completed"
      ? `Ученик завершил курс: ${input.learnerName} / ${input.courseTitle}`
      : input.notificationType === "low_activity"
        ? `Низкая активность: ${input.learnerName} / ${input.courseTitle}`
        : `Скоро истекает доступ: ${input.learnerName} / ${input.courseTitle}`;

  const headline =
    input.notificationType === "course_completed"
      ? `Ученик <strong>${safeLearnerName}</strong> завершил курс «${safeCourseTitle}».`
      : input.notificationType === "low_activity"
        ? `Ученик <strong>${safeLearnerName}</strong> давно не заходил в курс «${safeCourseTitle}».`
        : `У ученика <strong>${safeLearnerName}</strong> скоро истекает доступ к курсу «${safeCourseTitle}».`;

  const details =
    input.notificationType === "course_completed"
      ? `Логин ученика: ${safeLearnerLogin}. Откройте курс, чтобы проверить результаты и прогресс.`
      : input.notificationType === "low_activity"
        ? `Логин ученика: ${safeLearnerLogin}. В курсе нет активности уже ${input.lowActivityDays ?? "N"} дн.`
        : `Логин ученика: ${safeLearnerLogin}. Доступ открыт до ${input.accessExpiresAtLabel ?? "указанной даты"} и истечет в ближайшие ${input.accessExpiringDays ?? "N"} дн.`;

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d7dde6;border-radius:8px;font-family:Arial,sans-serif;color:#1f2937;">
        <tr>
          <td style="padding:24px 28px 12px 28px;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">${htmlGreeting}</p>
            <p style="margin:0 0 16px 0;font-size:28px;line-height:1.35;">${headline}</p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">${details}</p>
            <p style="margin:0 0 8px 0;font-size:16px;line-height:1.45;">Перейдите по ссылке:</p>
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
    `${textGreeting}\n\n` +
    (input.notificationType === "course_completed"
      ? `Ученик ${input.learnerName} завершил курс «${input.courseTitle}».\n`
      : input.notificationType === "low_activity"
        ? `Ученик ${input.learnerName} давно не заходил в курс «${input.courseTitle}».\n`
        : `У ученика ${input.learnerName} скоро истекает доступ к курсу «${input.courseTitle}».\n`) +
    `Логин ученика: ${input.learnerLogin}.\n` +
    (input.notificationType === "low_activity"
      ? `В курсе нет активности уже ${input.lowActivityDays ?? "N"} дн.\n`
      : input.notificationType === "access_expiring"
        ? `Доступ открыт до ${input.accessExpiresAtLabel ?? "указанной даты"} и скоро истечет.\n`
        : "Проверьте результаты и прогресс ученика.\n") +
    `\nПерейдите по ссылке:\n${input.courseUrl}\n\n` +
    `Пожалуйста, не отвечайте на это автоматическое сообщение.`;

  return { subject, html, text };
}
