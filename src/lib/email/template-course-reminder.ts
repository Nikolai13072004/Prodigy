import { buildEmailGreeting, renderMultilineHtml } from "@/lib/email/template-format";

export type CourseReminderType = "NOT_STARTED" | "EXPIRING" | "EXPIRED" | "QUIZ_FAILED";

type Input = {
  recipientName?: string | null;
  courseTitle: string;
  courseUrl: string;
  type: CourseReminderType;
  deadlineLabel?: string | null;
};

const TYPE_LABELS: Record<CourseReminderType, { subject: string; heading: string; body: string }> = {
  NOT_STARTED: {
    subject: "Напоминание: курс еще не начат",
    heading: "Вы еще не начали назначенный курс.",
    body: "Откройте курс и начните обучение. Это поможет пройти материалы без спешки перед сроком выполнения.",
  },
  EXPIRING: {
    subject: "Напоминание: срок курса скоро истекает",
    heading: "Срок выполнения курса скоро истекает.",
    body: "Проверьте оставшиеся материалы и завершите курс до указанного срока.",
  },
  EXPIRED: {
    subject: "Срок выполнения курса истек",
    heading: "Срок выполнения курса уже истек.",
    body: "Откройте курс и завершите оставшиеся материалы. Если доступ закрыт, обратитесь к администратору обучения.",
  },
  QUIZ_FAILED: {
    subject: "Напоминание: тест по курсу не сдан",
    heading: "По курсу есть тест с неуспешной попыткой.",
    body: "Повторите материалы курса и используйте доступные попытки для повторной проверки знаний.",
  },
};

export function buildCourseReminderEmailTemplate(input: Input) {
  const meta = TYPE_LABELS[input.type];
  const greeting = buildEmailGreeting(input.recipientName);
  const deadlineLine = input.deadlineLabel ? `\n\nСрок: ${input.deadlineLabel}` : "";
  const text = `${greeting}\n\n${meta.heading}\n\nКурс: ${input.courseTitle}${deadlineLine}\n\n${meta.body}\n\nПерейти к курсу:\n${input.courseUrl}\n\nПожалуйста, не отвечайте на это автоматическое сообщение.`;

  return {
    subject: meta.subject,
    text,
    html: `
      <div style="background:#e4e8ed;padding:32px 16px 40px 16px;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:48px 36px;font-family:Arial,Helvetica,sans-serif;color:#334155;">
          <h1 style="margin:0 0 18px 0;font-size:22px;line-height:1.25;color:#0f172a;">${renderMultilineHtml(meta.heading)}</h1>
          <div style="font-size:16px;line-height:1.5;">${renderMultilineHtml(text)}</div>
        </div>
      </div>
    `.trim(),
  };
}
