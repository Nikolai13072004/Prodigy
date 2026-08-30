import { buildEmailGreeting, escapeHtml, renderMultilineHtml } from "@/lib/email/template-format";

type QuizReviewedTemplateInput = {
  recipientName?: string | null;
  courseTitle: string;
  quizTitle: string;
  resultUrl: string;
  outcome: "PASSED" | "FAILED";
  reviewComment?: string | null;
};

export function buildQuizReviewedEmailTemplate(input: QuizReviewedTemplateInput) {
  const safeCourseTitle = escapeHtml(input.courseTitle);
  const safeQuizTitle = escapeHtml(input.quizTitle);
  const safeResultUrl = escapeHtml(input.resultUrl);
  const safeComment = input.reviewComment ? renderMultilineHtml(input.reviewComment) : null;
  const greeting = buildEmailGreeting(input.recipientName, escapeHtml);
  const outcomeLabel = input.outcome === "PASSED" ? "зачтена" : "проверена";
  const finalStatusLabel = input.outcome === "PASSED" ? "Результат: зачет." : "Результат: требуется доработка.";
  const subject =
    input.outcome === "PASSED" ? "Преподаватель зачел вашу работу" : "Преподаватель проверил вашу работу";

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d7dde6;border-radius:8px;font-family:Arial,sans-serif;color:#1f2937;">
        <tr>
          <td style="padding:24px 28px 12px 28px;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">${greeting}</p>
            <p style="margin:0 0 16px 0;font-size:28px;line-height:1.35;">Ваша работа по курсу «${safeCourseTitle}» ${outcomeLabel}.</p>
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.45;">Задание: <strong>${safeQuizTitle}</strong></p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;"><strong>${finalStatusLabel}</strong></p>
            ${
              safeComment
                ? `<div style="margin:0 0 16px 0;padding:16px;border:1px solid #d7dde6;border-radius:8px;background:#f8fafc;font-size:15px;line-height:1.5;">
            <div style="margin:0 0 8px 0;font-weight:600;">Комментарий преподавателя</div>
            <div>${safeComment}</div>
          </div>`
                : ""
            }
            <p style="margin:0 0 8px 0;font-size:16px;line-height:1.45;">Открыть результат:</p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.45;">
              <a href="${safeResultUrl}" style="color:#0b5cab;text-decoration:none;">${safeResultUrl}</a>
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
    `Ваша работа по курсу «${input.courseTitle}» проверена.\n` +
    `Задание: ${input.quizTitle}\n` +
    `${finalStatusLabel}\n\n` +
    (input.reviewComment ? `Комментарий преподавателя:\n${input.reviewComment}\n\n` : "") +
    `Открыть результат:\n${input.resultUrl}\n\n` +
    `Пожалуйста, не отвечайте на это автоматическое сообщение.`;

  return { subject, html, text };
}
