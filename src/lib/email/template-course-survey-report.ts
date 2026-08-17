import { buildEmailGreeting, escapeHtml, renderMultilineHtml } from "@/lib/email/template-format";
import { COURSE_SURVEY_QUESTION_TYPE_LABELS, type CourseSurveyQuestionType } from "@/lib/course-surveys";

type CourseSurveyReportAnswer = {
  questionTitle: string;
  questionType: CourseSurveyQuestionType;
  answerText: string | null;
};

type CourseSurveyReportTemplateInput = {
  recipientName?: string | null;
  courseTitle: string;
  surveyTitle: string;
  learnerName: string;
  learnerEmail?: string | null;
  submittedAt: Date;
  manageUrl: string;
  answers: CourseSurveyReportAnswer[];
};

export function buildCourseSurveyReportEmailTemplate(input: CourseSurveyReportTemplateInput) {
  const safeCourseTitle = escapeHtml(input.courseTitle);
  const safeSurveyTitle = escapeHtml(input.surveyTitle);
  const safeLearnerName = escapeHtml(input.learnerName);
  const safeLearnerEmail = input.learnerEmail ? escapeHtml(input.learnerEmail) : null;
  const safeSubmittedAt = escapeHtml(formatDateTimeRu(input.submittedAt));
  const safeManageUrl = escapeHtml(input.manageUrl);
  const greeting = buildEmailGreeting(input.recipientName, escapeHtml);
  const subject = `[Завершен] Результаты опроса: «${input.surveyTitle}»`;

  const answersHtml = input.answers
    .map((answer, index) => renderAnswerHtml(answer, index))
    .join("");
  const answersText = input.answers
    .map((answer, index) => renderAnswerText(answer, index))
    .join("\n\n");

  const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #d7dde6;border-radius:8px;font-family:Arial,sans-serif;color:#1f2937;">
        <tr>
          <td style="padding:24px 28px;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.45;">${greeting}</p>
            <p style="margin:0 0 16px 0;font-size:18px;line-height:1.45;">Ознакомьтесь с результатами опроса «${safeSurveyTitle}».</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px 0;border-collapse:collapse;font-size:14px;line-height:1.45;">
              <tr><td style="padding:4px 12px 4px 0;color:#4b5563;width:140px;">Курс</td><td style="padding:4px 0;font-weight:600;">${safeCourseTitle}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#4b5563;">Имя</td><td style="padding:4px 0;">${safeLearnerName}</td></tr>
              ${
                safeLearnerEmail
                  ? `<tr><td style="padding:4px 12px 4px 0;color:#4b5563;">Email</td><td style="padding:4px 0;"><a href="mailto:${safeLearnerEmail}" style="color:#0b5cab;text-decoration:none;">${safeLearnerEmail}</a></td></tr>`
                  : ""
              }
              <tr><td style="padding:4px 12px 4px 0;color:#4b5563;">Дата/время</td><td style="padding:4px 0;font-weight:600;">${safeSubmittedAt}</td></tr>
            </table>

            ${answersHtml}

            <p style="margin:22px 0 8px 0;font-size:15px;line-height:1.45;">Открыть ответы в LMS:</p>
            <p style="margin:0 0 18px 0;font-size:15px;line-height:1.45;">
              <a href="${safeManageUrl}" style="color:#0b5cab;text-decoration:none;">${safeManageUrl}</a>
            </p>
            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.45;">Пожалуйста, не отвечайте на это автоматическое сообщение.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

  const text =
    `${buildEmailGreeting(input.recipientName)}\n\n` +
    `Ознакомьтесь с результатами опроса «${input.surveyTitle}».\n\n` +
    `Курс: ${input.courseTitle}\n` +
    `Имя: ${input.learnerName}\n` +
    (input.learnerEmail ? `Email: ${input.learnerEmail}\n` : "") +
    `Дата/время: ${formatDateTimeRu(input.submittedAt)}\n\n` +
    `${answersText}\n\n` +
    `Открыть ответы в LMS:\n${input.manageUrl}\n\n` +
    `Пожалуйста, не отвечайте на это автоматическое сообщение.`;

  return { subject, html, text };
}

function renderAnswerHtml(answer: CourseSurveyReportAnswer, index: number) {
  const safeQuestionTitle = escapeHtml(answer.questionTitle);
  const safeQuestionType = escapeHtml(COURSE_SURVEY_QUESTION_TYPE_LABELS[answer.questionType]);
  const answerHtml = answer.answerText?.trim()
    ? renderMultilineHtml(answer.answerText)
    : '<span style="color:#6b7280;">Ответ не указан</span>';

  return `
<div style="margin:0 0 22px 0;">
  <p style="margin:0 0 4px 0;font-size:13px;color:#4b5563;"><strong>Вопрос ${index + 1}</strong> · Опрос</p>
  <p style="margin:0 0 4px 0;font-size:15px;line-height:1.45;"><strong>${safeQuestionTitle}</strong></p>
  <p style="margin:0 0 10px 0;font-size:13px;color:#4b5563;">${safeQuestionType}</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;line-height:1.45;">
    <tr>
      <td style="padding:7px 8px;border:1px solid #d7dde6;background:#f3f4f6;font-weight:600;">Ответ пользователя</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #d7dde6;border-top:0;">${answerHtml}</td>
    </tr>
  </table>
</div>`.trim();
}

function renderAnswerText(answer: CourseSurveyReportAnswer, index: number) {
  const typeLabel = COURSE_SURVEY_QUESTION_TYPE_LABELS[answer.questionType];
  return (
    `Вопрос ${index + 1} · Опрос\n` +
    `${answer.questionTitle}\n` +
    `${typeLabel}\n` +
    `Ответ пользователя: ${answer.answerText?.trim() || "Ответ не указан"}`
  );
}

function formatDateTimeRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
