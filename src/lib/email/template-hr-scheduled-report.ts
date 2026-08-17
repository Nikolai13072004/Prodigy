import { buildEmailGreeting } from "@/lib/email/template-format";

type HrScheduledReportTemplateInput = {
  recipientName?: string | null;
  reportLabel: string;
  generatedAtLabel: string;
  summaryItems: Array<{
    label: string;
    value: string;
  }>;
  highlightsTitle?: string | null;
  highlights: string[];
  reportUrl: string;
};

export function buildHrScheduledReportEmailTemplate(input: HrScheduledReportTemplateInput) {
  const htmlGreeting = buildEmailGreeting(input.recipientName, escapeHtml);
  const textGreeting = buildEmailGreeting(input.recipientName);
  const summaryHtml = input.summaryItems
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#52525b;">${escapeHtml(item.label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e4e4e7;color:#18181b;font-weight:600;">${escapeHtml(item.value)}</td>
        </tr>`
    )
    .join("");
  const highlightsHtml = input.highlights.length
    ? `<div style="margin-top:20px;">
        <div style="font-size:14px;font-weight:600;color:#18181b;margin-bottom:8px;">${escapeHtml(
          input.highlightsTitle ?? "Ключевые строки отчета"
        )}</div>
        <ul style="margin:0;padding-left:18px;color:#3f3f46;font-size:14px;line-height:1.6;">
          ${input.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>`
    : "";

  const subject = `Ежемесячный отчет LMS: ${input.reportLabel}`;
  const html = `<!DOCTYPE html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b;">
    <div style="max-width:720px;margin:0 auto;padding:24px 16px;">
      <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:24px;">
        <div style="display:inline-block;background:#dcfce7;color:#166534;font-size:12px;font-weight:700;padding:6px 10px;border-radius:999px;">
          Ежемесячная рассылка отчета
        </div>
        <h1 style="margin:16px 0 8px;font-size:24px;line-height:1.3;">${escapeHtml(input.reportLabel)}</h1>
        <p style="margin:0 0 16px;color:#52525b;font-size:14px;line-height:1.6;">
          ${htmlGreeting} Ниже собрана автоматическая ежемесячная сводка по обучению. Отчет сформирован ${escapeHtml(
            input.generatedAtLabel
          )}.
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
          <tbody>${summaryHtml}</tbody>
        </table>

        ${highlightsHtml}

        <div style="margin-top:24px;">
          <a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:12px;">
            Открыть отчет в LMS
          </a>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    `Ежемесячный отчет LMS: ${input.reportLabel}`,
    "",
    textGreeting,
    `Отчет сформирован ${input.generatedAtLabel}.`,
    "",
    ...input.summaryItems.map((item) => `${item.label}: ${item.value}`),
    input.highlights.length ? "" : null,
    input.highlights.length ? `${input.highlightsTitle ?? "Ключевые строки отчета"}:` : null,
    ...input.highlights.map((item) => `- ${item}`),
    "",
    `Открыть отчет: ${input.reportUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
