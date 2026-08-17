import prisma from "@/lib/prisma";
import { buildHrScheduledReportEmailTemplate } from "@/lib/email/template-hr-scheduled-report";
import { getHrCourseAnalyticsData } from "@/lib/hr-course-analytics";
import { getCourseResultsData } from "@/lib/course-results";
import { PERMISSIONS, ROLES } from "@/lib/roles";

const MAX_RECIPIENTS = 20;
const SCHEDULE_RUN_HOUR = 9;
const EMAIL_TEMPLATE = "HR_REPORT_SCHEDULE";

export const HR_REPORT_SCHEDULE_TYPES = {
  COURSE_SUMMARY: "COURSE_SUMMARY",
  COURSE_RESULTS: "COURSE_RESULTS",
  ANSWERS_ANALYSIS: "ANSWERS_ANALYSIS",
} as const;

export type HrReportScheduleType =
  (typeof HR_REPORT_SCHEDULE_TYPES)[keyof typeof HR_REPORT_SCHEDULE_TYPES];

export type HrReportScheduleView = {
  id: string;
  reportType: HrReportScheduleType;
  reportTypeLabel: string;
  courseId: string | null;
  courseTitle: string | null;
  recipients: string[];
  isPaused: boolean;
  nextRunAt: Date;
  lastSentAt: Date | null;
  createdAt: Date;
};

type QueuedScheduleReport = {
  reportLabel: string;
  reportUrl: string;
  summaryItems: Array<{
    label: string;
    value: string;
  }>;
  highlightsTitle: string;
  highlights: string[];
  payload: Record<string, string | number | null>;
};

export function getHrReportScheduleType(value: string | null | undefined): HrReportScheduleType {
  if (value === HR_REPORT_SCHEDULE_TYPES.ANSWERS_ANALYSIS) {
    return HR_REPORT_SCHEDULE_TYPES.ANSWERS_ANALYSIS;
  }
  return value === HR_REPORT_SCHEDULE_TYPES.COURSE_RESULTS
    ? HR_REPORT_SCHEDULE_TYPES.COURSE_RESULTS
    : HR_REPORT_SCHEDULE_TYPES.COURSE_SUMMARY;
}

export function getHrReportScheduleTypeLabel(type: HrReportScheduleType, courseTitle?: string | null) {
  if (type === HR_REPORT_SCHEDULE_TYPES.ANSWERS_ANALYSIS) {
    return courseTitle ? `Анализ ответов: ${courseTitle}` : "Анализ ответов по курсу";
  }
  if (type === HR_REPORT_SCHEDULE_TYPES.COURSE_RESULTS) {
    return courseTitle ? `Отчет по курсу: ${courseTitle}` : "Отчет по конкретному курсу";
  }
  return "Сводный отчет по курсам";
}

export function getInitialHrReportScheduleRunAt(from = new Date()) {
  const run = new Date(from);
  run.setDate(1);
  run.setHours(SCHEDULE_RUN_HOUR, 0, 0, 0);

  if (from.getTime() >= run.getTime()) {
    run.setMonth(run.getMonth() + 1);
    run.setDate(1);
    run.setHours(SCHEDULE_RUN_HOUR, 0, 0, 0);
  }

  return run;
}

export function getFollowingHrReportScheduleRunAt(currentRunAt: Date) {
  const next = new Date(currentRunAt);
  next.setMonth(next.getMonth() + 1);
  next.setDate(1);
  next.setHours(SCHEDULE_RUN_HOUR, 0, 0, 0);
  return next;
}

export function parseHrReportScheduleRecipients(input: string) {
  const values = Array.from(
    new Set(
      input
        .split(/[\n,;]+/g)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const value of values) {
    if (isEmail(value)) {
      valid.push(value);
    } else {
      invalid.push(value);
    }
  }

  return {
    recipients: valid.slice(0, MAX_RECIPIENTS),
    invalid,
    isTrimmed: valid.length > MAX_RECIPIENTS,
  };
}

export async function getHrReportSchedulesForUser(userId: string): Promise<HrReportScheduleView[]> {
  const schedules = await prisma.hrReportSchedule.findMany({
    where: { createdById: userId },
    orderBy: [{ isPaused: "asc" }, { nextRunAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      reportType: true,
      courseId: true,
      recipientsJson: true,
      isPaused: true,
      nextRunAt: true,
      lastSentAt: true,
      createdAt: true,
      course: {
        select: {
          title: true,
        },
      },
    },
  });

  return schedules.map((schedule) => ({
    id: schedule.id,
    reportType: getHrReportScheduleType(schedule.reportType),
    reportTypeLabel: getHrReportScheduleTypeLabel(
      getHrReportScheduleType(schedule.reportType),
      schedule.course?.title ?? null
    ),
    courseId: schedule.courseId,
    courseTitle: schedule.course?.title ?? null,
    recipients: parseStoredRecipients(schedule.recipientsJson),
    isPaused: schedule.isPaused,
    nextRunAt: schedule.nextRunAt,
    lastSentAt: schedule.lastSentAt,
    createdAt: schedule.createdAt,
  }));
}

export async function queueDueHrReportScheduleEmails(now = new Date()) {
  const schedules = await prisma.hrReportSchedule.findMany({
    where: {
      isPaused: false,
      nextRunAt: { lte: now },
    },
    orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      reportType: true,
      courseId: true,
      recipientsJson: true,
      nextRunAt: true,
      course: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  let queuedSchedules = 0;
  let queuedEmails = 0;

  for (const schedule of schedules) {
    const recipients = parseStoredRecipients(schedule.recipientsJson);
    const nextRunAt = getFollowingHrReportScheduleRunAt(schedule.nextRunAt);
    const periodKey = formatSchedulePeriodKey(schedule.nextRunAt);

    if (recipients.length === 0) {
      await prisma.hrReportSchedule.update({
        where: { id: schedule.id },
        data: {
          nextRunAt,
        },
      });
      continue;
    }

    const existingDispatch = await prisma.hrReportScheduleDispatch.findUnique({
      where: {
        scheduleId_periodKey: {
          scheduleId: schedule.id,
          periodKey,
        },
      },
      select: { id: true },
    });

    if (existingDispatch) {
      await prisma.hrReportSchedule.update({
        where: { id: schedule.id },
        data: {
          nextRunAt,
        },
      });
      continue;
    }

    try {
      const report = await buildQueuedScheduleReport({
        reportType: getHrReportScheduleType(schedule.reportType),
        courseId: schedule.courseId,
      });

      const queuedAt = new Date();
      const template = buildHrScheduledReportEmailTemplate({
        reportLabel: report.reportLabel,
        generatedAtLabel: formatDateTimeRu(queuedAt),
        summaryItems: report.summaryItems,
        highlightsTitle: report.highlightsTitle,
        highlights: report.highlights,
        reportUrl: report.reportUrl,
      });

      await prisma.$transaction([
        prisma.hrReportScheduleDispatch.create({
          data: {
            scheduleId: schedule.id,
            periodKey,
            recipientCount: recipients.length,
          },
        }),
        prisma.emailJob.createMany({
          data: recipients.map((email) => ({
            toEmail: email,
            toName: null,
            subject: template.subject,
            htmlBody: template.html,
            textBody: template.text,
            template: EMAIL_TEMPLATE,
            payloadJson: JSON.stringify({
              scheduleId: schedule.id,
              reportType: getHrReportScheduleType(schedule.reportType),
              courseId: schedule.courseId ?? null,
              courseTitle: schedule.course?.title ?? null,
              periodKey,
              queuedAt: queuedAt.toISOString(),
              ...report.payload,
            }),
            maxAttempts: 5,
            nextAttemptAt: queuedAt,
          })),
        }),
        prisma.hrReportSchedule.update({
          where: { id: schedule.id },
          data: {
            lastSentAt: queuedAt,
            nextRunAt,
          },
        }),
      ]);

      queuedSchedules += 1;
      queuedEmails += recipients.length;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        await prisma.hrReportSchedule.update({
          where: { id: schedule.id },
          data: {
            nextRunAt,
          },
        });
        continue;
      }

      console.error("[hr-report-schedules] failed to queue schedule", {
        scheduleId: schedule.id,
        error,
      });
    }
  }

  return {
    queuedSchedules,
    queuedEmails,
  };
}

async function buildQueuedScheduleReport(args: {
  reportType: HrReportScheduleType;
  courseId: string | null;
}): Promise<QueuedScheduleReport> {
  if (args.reportType === HR_REPORT_SCHEDULE_TYPES.ANSWERS_ANALYSIS) {
    return buildAnswersAnalysisScheduleReport(args.courseId);
  }
  return args.reportType === HR_REPORT_SCHEDULE_TYPES.COURSE_RESULTS
    ? buildCourseResultsScheduleReport(args.courseId)
    : buildCourseSummaryScheduleReport();
}

async function buildCourseSummaryScheduleReport(): Promise<QueuedScheduleReport> {
  const data = await getHrCourseAnalyticsData({
    q: "",
    statusFilter: "published",
  });

  const highlightRows = [...data.rows]
    .sort((left, right) => {
      if (right.assignedLearnersCount !== left.assignedLearnersCount) {
        return right.assignedLearnersCount - left.assignedLearnersCount;
      }
      return left.title.localeCompare(right.title, "ru", { sensitivity: "base", numeric: true });
    })
    .slice(0, 5)
    .map(
      (row) =>
        `${row.title}: назначено ${row.assignedLearnersCount}, завершили ${formatPercent(
          row.completedLearnersPercent
        )}, средний прогресс ${formatPercent(row.avgProgressPercent)}`
    );

  return {
    reportLabel: "Сводный отчет по курсам",
    reportUrl: toAbsoluteUrl(appBaseUrl(), "/analytics"),
    summaryItems: [
      { label: "Опубликованных курсов", value: String(data.summary.publishedCourses) },
      { label: "Курсов с назначениями", value: String(data.summary.coursesWithAssignments) },
      { label: "Назначенных учеников", value: String(data.summary.assignedLearners) },
      { label: "Завершили обучение", value: String(data.summary.completedLearners) },
      { label: "Средний прогресс", value: formatPercent(data.summary.avgProgressPercent) },
      {
        label: "Средняя оценка",
        value: data.summary.avgGradePercent == null ? "Нет данных" : formatPercent(data.summary.avgGradePercent),
      },
      { label: "Ожидающих приглашений", value: String(data.summary.pendingInvites) },
    ],
    highlightsTitle: "Курсы с наибольшим охватом",
    highlights: highlightRows,
    payload: {
      reportLabel: "Сводный отчет по курсам",
    },
  };
}

async function buildCourseResultsScheduleReport(courseId: string | null): Promise<QueuedScheduleReport> {
  if (!courseId) {
    throw new Error("Course is required for course results schedule.");
  }

  const data = await getCourseResultsData({
    courseId,
    q: "",
    statusFilter: "all",
    user: {
      id: "system-report-schedule",
      roles: [ROLES.ADMIN],
      permissions: Object.values(PERMISSIONS),
    },
  });

  if (!data) {
    throw new Error("Course not found for course results schedule.");
  }

  const highlightRows = [...data.rows]
    .filter((row) => row.resultStatusCode !== "PASSED")
    .sort((left, right) => {
      if (left.resultStatusCode !== right.resultStatusCode) {
        return left.resultStatusCode.localeCompare(right.resultStatusCode, "ru", { sensitivity: "base" });
      }
      return left.name.localeCompare(right.name, "ru", { sensitivity: "base", numeric: true });
    })
    .slice(0, 5)
    .map((row) => `${row.name}: ${row.resultStatusLabel}, прогресс ${formatPercent(row.progress.percent)}`);

  return {
    reportLabel: `Отчет по курсу «${data.course.title}»`,
    reportUrl: toAbsoluteUrl(appBaseUrl(), `/courses/${data.course.id}/results`),
    summaryItems: [
      { label: "Учеников в отчете", value: String(data.summary.total) },
      { label: "С попытками", value: String(data.summary.withAttempts) },
      { label: "Завершили", value: String(data.summary.passed) },
      { label: "В процессе", value: String(data.summary.inProgress) },
      { label: "Не начали", value: String(data.summary.notStarted) },
      { label: "Не прошли", value: String(data.summary.failed) },
      { label: "Ожидающих приглашений", value: String(data.summary.pendingInvites) },
    ],
    highlightsTitle: "Ученики, требующие внимания",
    highlights: highlightRows,
    payload: {
      reportLabel: data.course.title,
      courseId: data.course.id,
      courseTitle: data.course.title,
    },
  };
}

async function buildAnswersAnalysisScheduleReport(courseId: string | null): Promise<QueuedScheduleReport> {
  if (!courseId) {
    throw new Error("Course is required for answers analysis schedule.");
  }

  const [course, attempts] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    }),
    prisma.quizAttempt.findMany({
      where: {
        quiz: {
          courseItem: {
            courseId,
          },
        },
      },
      select: {
        id: true,
        userId: true,
        outcome: true,
        score: true,
        maxScore: true,
      },
    }),
  ]);

  if (!course) {
    throw new Error("Course not found for answers analysis schedule.");
  }

  const attemptsTotal = attempts.length;
  const uniqueLearners = new Set(attempts.map((attempt) => attempt.userId)).size;
  const passedAttempts = attempts.filter((attempt) => attempt.outcome === "PASSED").length;
  const failedAttempts = attempts.filter((attempt) => attempt.outcome !== "PASSED").length;
  const averageScorePercent =
    attemptsTotal > 0
      ? attempts.reduce((sum, attempt) => sum + (attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0), 0) /
        attemptsTotal
      : 0;

  return {
    reportLabel: `Анализ ответов: «${course.title}»`,
    reportUrl: toAbsoluteUrl(appBaseUrl(), `/admin/reports/answers-analysis?courseId=${encodeURIComponent(course.id)}`),
    summaryItems: [
      { label: "Курс", value: course.title },
      { label: "Всего попыток", value: String(attemptsTotal) },
      { label: "Уникальные прохождения", value: String(uniqueLearners) },
      { label: "Пройдено", value: String(passedAttempts) },
      { label: "Не пройдено", value: String(failedAttempts) },
      { label: "Средний балл", value: `${averageScorePercent.toFixed(1)}%` },
    ],
    highlightsTitle: "Ключевые метрики",
    highlights: [
      `Всего попыток: ${attemptsTotal}`,
      `Уникальные прохождения: ${uniqueLearners}`,
      `Пройдено: ${passedAttempts}, не пройдено: ${failedAttempts}`,
    ],
    payload: {
      reportLabel: course.title,
      courseId: course.id,
      courseTitle: course.title,
      attemptsTotal,
      uniqueLearners,
    },
  };
}

function parseStoredRecipients(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function formatSchedulePeriodKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error && "code" in error && String(error.code) === "P2002";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatDateTimeRu(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function appBaseUrl() {
  return (
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  );
}

function toAbsoluteUrl(baseUrl: string, href: string) {
  return new URL(href, baseUrl).toString();
}
