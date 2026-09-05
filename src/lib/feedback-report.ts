import { COURSE_FEEDBACK_STATUS_LABELS, type CourseFeedbackStatus } from "@/lib/constants";
import prisma from "@/lib/prisma";
import { buildXlsxWorkbook } from "@/lib/xlsx";

export type FeedbackReportStatus = "all" | "published" | "pending";
export type FeedbackReportRating = "all" | "5" | "4" | "3" | "2" | "1" | "low";

export type FeedbackReportFilters = {
  q?: string;
  courseId?: string;
  status?: FeedbackReportStatus;
  rating?: FeedbackReportRating;
  createdFrom?: string;
  createdTo?: string;
};

export type FeedbackReportRow = {
  id: string;
  courseId: string;
  courseTitle: string;
  learnerId: string;
  learnerName: string;
  learnerLogin: string;
  learnerEmail: string | null;
  rating: number;
  status: CourseFeedbackStatus;
  statusLabel: string;
  comment: string | null;
  createdAt: Date;
};

export type FeedbackReportCourseRow = {
  courseId: string;
  courseTitle: string;
  feedbacksCount: number;
  averageRating: number | null;
  publishedCount: number;
  pendingCount: number;
  lowRatingCount: number;
  withCommentsCount: number;
  lastFeedbackAt: Date | null;
};

export type FeedbackReportData = {
  rows: FeedbackReportRow[];
  courseRows: FeedbackReportCourseRow[];
  summary: {
    total: number;
    averageRating: number | null;
    published: number;
    pending: number;
    withComments: number;
    lowRatings: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  };
};

export async function getFeedbackReportData(filters: FeedbackReportFilters): Promise<FeedbackReportData> {
  const q = (filters.q ?? "").trim();
  const status = getFeedbackReportStatusParam(filters.status);
  const rating = getFeedbackReportRatingParam(filters.rating);
  const createdFrom = parseDateStart(filters.createdFrom);
  const createdTo = parseDateEnd(filters.createdTo);

  const feedbacks = await prisma.courseFeedback.findMany({
    where: {
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(status === "published"
        ? { status: "PUBLISHED" }
        : status === "pending"
          ? { status: "PENDING" }
          : {}),
      ...(rating === "low"
        ? { rating: { lte: 3 } }
        : rating !== "all"
          ? { rating: Number(rating) }
          : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lte: createdTo } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { comment: { contains: q, mode: "insensitive" as const } },
              { course: { title: { contains: q, mode: "insensitive" as const } } },
              { user: { name: { contains: q, mode: "insensitive" as const } } },
              { user: { login: { contains: q, mode: "insensitive" as const } } },
              { user: { email: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { rating: "asc" }],
    select: {
      id: true,
      courseId: true,
      userId: true,
      rating: true,
      status: true,
      comment: true,
      createdAt: true,
      course: {
        select: {
          title: true,
        },
      },
      user: {
        select: {
          name: true,
          login: true,
          email: true,
        },
      },
    },
  });

  const rows = feedbacks.map((feedback) => {
    const status = normalizeFeedbackStatus(feedback.status);

    return {
      id: feedback.id,
      courseId: feedback.courseId,
      courseTitle: feedback.course.title,
      learnerId: feedback.userId,
      learnerName: feedback.user.name || feedback.user.login,
      learnerLogin: feedback.user.login,
      learnerEmail: feedback.user.email,
      rating: feedback.rating,
      status,
      statusLabel: COURSE_FEEDBACK_STATUS_LABELS[status],
      comment: feedback.comment,
      createdAt: feedback.createdAt,
    } satisfies FeedbackReportRow;
  });

  return {
    rows,
    courseRows: buildCourseRows(rows),
    summary: buildSummary(rows),
  };
}

export function getFeedbackReportStatusParam(value: string | null | undefined): FeedbackReportStatus {
  if (value === "published" || value === "pending") return value;
  return "all";
}

export function getFeedbackReportRatingParam(value: string | null | undefined): FeedbackReportRating {
  if (value === "5" || value === "4" || value === "3" || value === "2" || value === "1" || value === "low") {
    return value;
  }
  return "all";
}

export function buildFeedbackReportXlsx(data: FeedbackReportData) {
  return buildXlsxWorkbook({
    sheetName: "Отзывы",
    rows: [
      ["Всего отзывов", data.summary.total],
      ["Средняя оценка", data.summary.averageRating ?? "Нет данных"],
      ["Опубликовано", data.summary.published],
      ["На модерации", data.summary.pending],
      ["С комментариями", data.summary.withComments],
      ["Низкие оценки", data.summary.lowRatings],
      [],
      ["Сводка по курсам"],
      ["Курс", "Отзывы", "Средняя оценка", "Опубликовано", "На модерации", "Низкие оценки", "С комментариями", "Последний отзыв"],
      ...data.courseRows.map((row) => [
        row.courseTitle,
        row.feedbacksCount,
        row.averageRating ?? "Нет данных",
        row.publishedCount,
        row.pendingCount,
        row.lowRatingCount,
        row.withCommentsCount,
        row.lastFeedbackAt ? formatDateTime(row.lastFeedbackAt) : "",
      ]),
      [],
      ["Детализация отзывов"],
      ["Дата", "Курс", "Сотрудник", "Логин", "Email", "Оценка", "Статус", "Комментарий"],
      ...data.rows.map((row) => [
        formatDateTime(row.createdAt),
        row.courseTitle,
        row.learnerName,
        row.learnerLogin,
        row.learnerEmail ?? "",
        row.rating,
        row.statusLabel,
        row.comment ?? "",
      ]),
    ],
  });
}

function buildSummary(rows: FeedbackReportRow[]): FeedbackReportData["summary"] {
  const distribution = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  } satisfies Record<1 | 2 | 3 | 4 | 5, number>;

  for (const row of rows) {
    if (row.rating >= 1 && row.rating <= 5) {
      distribution[row.rating as 1 | 2 | 3 | 4 | 5] += 1;
    }
  }

  return {
    total: rows.length,
    averageRating: averageRating(rows),
    published: rows.filter((row) => row.status === "PUBLISHED").length,
    pending: rows.filter((row) => row.status === "PENDING").length,
    withComments: rows.filter((row) => Boolean(row.comment?.trim())).length,
    lowRatings: rows.filter((row) => row.rating <= 3).length,
    distribution,
  };
}

function buildCourseRows(rows: FeedbackReportRow[]) {
  const byCourse = new Map<string, FeedbackReportRow[]>();
  for (const row of rows) {
    byCourse.set(row.courseId, [...(byCourse.get(row.courseId) ?? []), row]);
  }

  return Array.from(byCourse.entries())
    .map(([courseId, courseRows]) => ({
      courseId,
      courseTitle: courseRows[0]?.courseTitle ?? "Курс",
      feedbacksCount: courseRows.length,
      averageRating: averageRating(courseRows),
      publishedCount: courseRows.filter((row) => row.status === "PUBLISHED").length,
      pendingCount: courseRows.filter((row) => row.status === "PENDING").length,
      lowRatingCount: courseRows.filter((row) => row.rating <= 3).length,
      withCommentsCount: courseRows.filter((row) => Boolean(row.comment?.trim())).length,
      lastFeedbackAt: courseRows.reduce<Date | null>(
        (latest, row) => (!latest || row.createdAt.getTime() > latest.getTime() ? row.createdAt : latest),
        null
      ),
    }))
    .sort((left, right) => {
      if (right.feedbacksCount !== left.feedbacksCount) return right.feedbacksCount - left.feedbacksCount;
      return left.courseTitle.localeCompare(right.courseTitle, "ru", { sensitivity: "base", numeric: true });
    });
}

function averageRating(rows: Array<{ rating: number }>) {
  if (rows.length === 0) return null;
  return Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 10) / 10;
}

function normalizeFeedbackStatus(value: string): CourseFeedbackStatus {
  return value === "PENDING" ? "PENDING" : "PUBLISHED";
}

function parseDateStart(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
