import {
  DEFAULT_COURSE_ASSIGNED_EMAIL_TEMPLATE,
  renderPlatformHtmlEmailTemplate,
  type PlatformHtmlEmailTemplate,
} from "@/lib/email/template-settings";

type CourseAssignedTemplateInput = {
  assigneeName?: string | null;
  assigneeFirstName?: string | null;
  courseTitle: string;
  courseUrl: string;
  accessExpiresAt?: Date | string | null;
  template?: PlatformHtmlEmailTemplate;
};

export function buildCourseAssignedEmailTemplate(input: CourseAssignedTemplateInput) {
  const template = input.template ?? DEFAULT_COURSE_ASSIGNED_EMAIL_TEMPLATE;
  const fullName = input.assigneeName?.trim() || "Пользователь";
  const firstName = input.assigneeFirstName?.trim() || fullName.split(/\s+/)[0] || fullName;

  return renderPlatformHtmlEmailTemplate(template, {
    accessDeadline: formatCourseAssignmentDeadline(input.accessExpiresAt),
    courseTitle: input.courseTitle,
    courseUrl: input.courseUrl,
    firstName,
    fullName,
    userName: firstName,
  });
}

function formatCourseAssignmentDeadline(value: Date | string | null | undefined) {
  if (!value) return "Срок выполнения для курса не ограничен.";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Срок выполнения для курса не ограничен.";

  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return `Срок выполнения для курса ${parts.day} ${parts.month} ${parts.year} г. в ${parts.hour}:${parts.minute} (GMT+3:00) Москва.`;
}
