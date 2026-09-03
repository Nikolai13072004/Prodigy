// Общие типы страницы аналитики (загрузчики данных ↔ презентационные секции).
// Вынесены из page.tsx без изменений.

export type AdminOverviewData = {
  coursesCount: number;
  usersCount: number;
  assignmentsCount: number;
  attemptsCount: number;
  avgResultPercent: number;
  avgFeedback: number;
  latestAttempts: {
    id: string;
    user: string;
    course: string;
    quiz: string;
    scorePercent: number;
    status: string;
    completedAt: Date;
  }[];
  problemCourses: CourseAnalyticsRow[];
  latestFeedback: {
    id: string;
    user: string;
    course: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
  }[];
};

export type CourseAnalyticsRow = {
  id: string;
  title: string;
  groupName: string;
  avgResultPercent: number;
  attemptsCount: number;
  failedCount: number;
  avgRating: number | null;
  activityStatus: string;
};

export type HrFeedbackFeedItem = {
  id: string;
  courseId: string;
  courseTitle: string;
  learnerName: string;
  learnerLogin: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
};

export type UserStatsData = {
  assignedCourses: number;
  completedCourses: number;
  avgResultPercent: number;
  lastActivity: Date | null;
  latestAttempts: {
    id: string;
    course: string;
    quiz: string;
    scorePercent: number;
    status: string;
    completedAt: Date;
  }[];
  courseProgress: {
    id: string;
    title: string;
    percent: number;
    completedRequired: number;
    requiredTotal: number;
    lecturePercent: number;
    quizPercent: number;
  }[];
};
