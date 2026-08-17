import { escapeHtml, formatHoursLabel } from "@/lib/email/template-format";

type CourseInviteTemplateInput = {
  courseTitle: string;
  inviteUrl: string;
  linkTtlHours: number;
  accessExpiresAt?: Date | null;
};

export function buildCourseInviteEmailTemplate(input: CourseInviteTemplateInput) {
  const safeTitle = escapeHtml(input.courseTitle);
  const safeUrl = escapeHtml(input.inviteUrl);
  const linkTtlLabel = formatHoursLabel(input.linkTtlHours);
  const safeLinkTtlLabel = escapeHtml(linkTtlLabel);
  const accessText = input.accessExpiresAt
    ? `Доступ к курсу будет открыт до ${input.accessExpiresAt.toLocaleDateString("ru-RU")}.`
    : "Доступ к курсу будет предоставлен без ограничения по сроку.";
  const safeAccessText = escapeHtml(accessText);

  const subject = "Вас пригласили на обучение";

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d7dde6;border-radius:8px;font-family:Arial,sans-serif;color:#1f2937;">
        <tr>
          <td style="padding:24px 28px 12px 28px;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">Здравствуйте!</p>
            <p style="margin:0 0 16px 0;font-size:30px;line-height:1.45;">
              Вас пригласили пройти курс «${safeTitle}».
            </p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">
              Чтобы зарегистрироваться на платформе и получить доступ к курсу, перейдите по ссылке:
            </p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.45;">
              <a href="${safeUrl}" style="color:#0b5cab;text-decoration:none;">${safeUrl}</a>
            </p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">
              Ссылка приглашения действует ${safeLinkTtlLabel}.
            </p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">
              ${safeAccessText}
            </p>
            <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.45;">Пожалуйста, не отвечайте на это автоматическое сообщение.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

  const text =
    `Здравствуйте!\n\n` +
    `Вас пригласили пройти курс «${input.courseTitle}».\n\n` +
    `Чтобы зарегистрироваться на платформе и получить доступ к курсу, перейдите по ссылке:\n${input.inviteUrl}\n\n` +
    `Ссылка приглашения действует ${linkTtlLabel}.\n\n` +
    `${accessText}\n\n` +
    `Пожалуйста, не отвечайте на это автоматическое сообщение.`;

  return { subject, html, text };
}
