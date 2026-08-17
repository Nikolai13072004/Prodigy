import type { CourseAccessWindow } from "@/lib/course-access-window";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CourseDeadlineTone = "neutral" | "info" | "warning" | "danger" | "success";

export type CourseDeadlineMeta = {
  title: string;
  description: string;
  compactLabel: string;
  tone: CourseDeadlineTone;
  isExpired: boolean;
  isUnlimited: boolean;
};

export function getCourseDeadlineMeta(
  accessWindow: CourseAccessWindow | null,
  isCompleted: boolean,
  now = new Date()
): CourseDeadlineMeta {
  if (!accessWindow || accessWindow.isUnlimited || !accessWindow.expiresAt) {
    return {
      title: "Без дедлайна",
      description: "Доступ бессрочный",
      compactLabel: "Доступ бессрочный",
      tone: "neutral",
      isExpired: false,
      isUnlimited: true,
    };
  }

  const formattedDate = formatCourseDeadlineDate(accessWindow.expiresAt);
  const daysUntilDeadline = Math.ceil((accessWindow.expiresAt.getTime() - now.getTime()) / DAY_MS);

  if (!accessWindow.isActive) {
    return {
      title: isCompleted ? `Доступ истек ${formattedDate}` : `Просрочено с ${formattedDate}`,
      description: isCompleted ? "Курс завершен, но срок доступа уже истек" : "Доступ к курсу истек",
      compactLabel: isCompleted ? `Доступ истек ${formattedDate}` : `Просрочено с ${formattedDate}`,
      tone: isCompleted ? "neutral" : "danger",
      isExpired: true,
      isUnlimited: false,
    };
  }

  if (isCompleted) {
    return {
      title: `Доступ истекает ${formattedDate}`,
      description: "Курс завершен, материалы доступны до этого срока",
      compactLabel: `Доступ до ${formattedDate}`,
      tone: "success",
      isExpired: false,
      isUnlimited: false,
    };
  }

  const daysLabel =
    daysUntilDeadline <= 0
      ? "срок истекает сегодня"
      : `осталось ${daysUntilDeadline} ${formatDaysWord(daysUntilDeadline)}`;

  return {
    title: `Завершить до ${formattedDate}`,
    description: `Доступ истекает ${formattedDate}, ${daysLabel}`,
    compactLabel: `Завершить до ${formattedDate}`,
    tone: daysUntilDeadline <= 7 ? "warning" : "info",
    isExpired: false,
    isUnlimited: false,
  };
}

export function formatCourseDeadlineDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatDaysWord(value: number) {
  const normalized = Math.abs(value);
  const lastTwo = normalized % 100;
  const last = normalized % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}
