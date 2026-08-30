import prisma from "@/lib/prisma";
import {
  buildManualReviewOutcome,
  getManualReviewQuestions,
  parseAttemptAnswers,
  parseManualReviewData,
  parseQuestionSnapshot,
} from "@/lib/quiz-manual-review";
import { scoreQuiz } from "@/lib/score-quiz";

export type CourseManualReviewStatusFilter = "all" | "pending" | "reviewed";

type ManualReviewAttemptSeed = {
  id: string;
  attemptNumber: number;
  score: number;
  maxScore: number;
  correctAnswers: number;
  totalQuestions: number;
  outcome: string;
  answers: string;
  questionSnapshot: string;
  manualReviewJson: string | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  completedAt: Date;
  user: {
    id: string;
    name: string;
    login: string;
    email: string | null;
  };
  quiz: {
    id: string;
    minCorrectAnswers: number;
    maxAttempts: number;
    courseItem: {
      id: string;
      title: string;
    };
  };
};

export type CourseManualReviewRow = {
  id: string;
  quizId: string;
  quizTitle: string;
  learnerId: string;
  learnerName: string;
  learnerLogin: string;
  learnerEmail: string | null;
  attemptNumber: number;
  status: "pending" | "reviewed";
  statusLabel: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  manualQuestionsCount: number;
  reviewCommentPreview: string | null;
};

export type SelectedCourseManualReviewAttempt = CourseManualReviewRow & {
  score: number;
  maxScore: number;
  correctAnswers: number;
  totalQuestions: number;
  minCorrectAnswers: number;
  maxAttempts: number;
  reviewComment: string;
  questions: Array<{
    id: string;
    type: string;
    prompt: string;
    config: string;
    points: number;
    answerText: string;
    fileUrl: string | null;
    fileName: string | null;
    awardedPoints: number | null;
    accepted: boolean | null;
  }>;
};

export type CourseManualReviewsData = {
  summary: {
    total: number;
    pending: number;
    reviewed: number;
  };
  rows: CourseManualReviewRow[];
  filteredRows: CourseManualReviewRow[];
  selectedAttempt: SelectedCourseManualReviewAttempt | null;
};

export function getCourseManualReviewStatusParam(
  value: string | undefined
): CourseManualReviewStatusFilter {
  if (value === "pending" || value === "reviewed") return value;
  return "all";
}

export async function getCourseManualReviewsData(args: {
  courseId: string;
  selectedAttemptId?: string;
  statusFilter: CourseManualReviewStatusFilter;
}): Promise<CourseManualReviewsData> {
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      quiz: {
        courseItem: {
          courseId: args.courseId,
        },
      },
      OR: [{ outcome: "PENDING_REVIEW" }, { reviewedAt: { not: null } }],
    },
    select: {
      id: true,
      attemptNumber: true,
      score: true,
      maxScore: true,
      correctAnswers: true,
      totalQuestions: true,
      outcome: true,
      answers: true,
      questionSnapshot: true,
      manualReviewJson: true,
      reviewComment: true,
      reviewedAt: true,
      reviewedById: true,
      reviewedByName: true,
      completedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          login: true,
          email: true,
        },
      },
      quiz: {
        select: {
          id: true,
          minCorrectAnswers: true,
          maxAttempts: true,
          courseItem: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  const prepared = attempts
    .map((attempt) => {
      const snapshot = parseQuestionSnapshot(attempt.questionSnapshot);
      const answers = parseAttemptAnswers(attempt.answers);
      const reviewData = parseManualReviewData(attempt.manualReviewJson);
      const manualQuestions = getManualReviewQuestions(snapshot, answers, reviewData);

      if (manualQuestions.length === 0) {
        return null;
      }

      return {
        attempt,
        snapshot,
        answers,
        reviewData,
        manualQuestions,
      };
    })
    .filter(
      (
        item
      ): item is {
        attempt: ManualReviewAttemptSeed;
        snapshot: ReturnType<typeof parseQuestionSnapshot>;
        answers: ReturnType<typeof parseAttemptAnswers>;
        reviewData: ReturnType<typeof parseManualReviewData>;
        manualQuestions: ReturnType<typeof getManualReviewQuestions>;
      } => Boolean(item)
    );

  const rows = prepared
    .map((item) => buildReviewRow(item.attempt, item.manualQuestions.length))
    .sort(compareReviewRows);

  const filteredRows = rows.filter((row) => {
    if (args.statusFilter === "all") return true;
    return row.status === args.statusFilter;
  });

  const selectedAttemptId =
    (args.selectedAttemptId &&
      filteredRows.find((row) => row.id === args.selectedAttemptId)?.id) ??
    filteredRows[0]?.id ??
    null;

  const selectedSource =
    selectedAttemptId === null
      ? null
      : prepared.find((item) => item.attempt.id === selectedAttemptId) ?? null;

  const selectedAttempt = selectedSource
    ? buildSelectedAttempt(selectedSource.attempt, selectedSource.snapshot, selectedSource.answers, selectedSource.reviewData)
    : null;

  return {
    summary: {
      total: rows.length,
      pending: rows.filter((row) => row.status === "pending").length,
      reviewed: rows.filter((row) => row.status === "reviewed").length,
    },
    rows,
    filteredRows,
    selectedAttempt,
  };
}

function buildReviewRow(attempt: ManualReviewAttemptSeed, manualQuestionsCount: number): CourseManualReviewRow {
  const status = attempt.outcome === "PENDING_REVIEW" ? "pending" : "reviewed";

  return {
    id: attempt.id,
    quizId: attempt.quiz.id,
    quizTitle: attempt.quiz.courseItem.title,
    learnerId: attempt.user.id,
    learnerName: attempt.user.name || attempt.user.login,
    learnerLogin: attempt.user.login,
    learnerEmail: attempt.user.email,
    attemptNumber: attempt.attemptNumber,
    status,
    statusLabel: status === "pending" ? "На проверке" : "Проверено",
    submittedAt: attempt.completedAt,
    reviewedAt: attempt.reviewedAt,
    reviewedByName: attempt.reviewedByName,
    manualQuestionsCount,
    reviewCommentPreview: truncateText(attempt.reviewComment, 120),
  };
}

function buildSelectedAttempt(
  attempt: ManualReviewAttemptSeed,
  snapshot: ReturnType<typeof parseQuestionSnapshot>,
  answers: ReturnType<typeof parseAttemptAnswers>,
  reviewData: ReturnType<typeof parseManualReviewData>
): SelectedCourseManualReviewAttempt {
  const row = buildReviewRow(attempt, getManualReviewQuestions(snapshot, answers, reviewData).length);
  const autoScored = scoreQuiz(snapshot, answers);
  const reviewOutcome =
    attempt.outcome === "PENDING_REVIEW"
      ? null
      : buildManualReviewOutcome({
          snapshot,
          answers,
          reviewData,
          minCorrectAnswers: attempt.quiz.minCorrectAnswers,
        });

  return {
    ...row,
    score: reviewOutcome?.score ?? autoScored.score,
    maxScore: reviewOutcome?.maxScore ?? autoScored.maxScore,
    correctAnswers: reviewOutcome?.correctAnswers ?? autoScored.correctAnswers,
    totalQuestions: reviewOutcome?.totalQuestions ?? autoScored.totalQuestions,
    minCorrectAnswers: attempt.quiz.minCorrectAnswers,
    maxAttempts: attempt.quiz.maxAttempts,
    reviewComment: attempt.reviewComment ?? "",
    questions: getManualReviewQuestions(snapshot, answers, reviewData).map((item) => ({
      id: item.question.id,
      type: item.question.type,
      prompt: item.question.prompt,
      config: item.question.config,
      points: item.question.points,
      answerText:
        item.question.type === "OPEN"
          ? String(item.answer ?? "").trim() || "Нет ответа"
          : item.fileAnswer?.fileName ?? "Файл не найден",
      fileUrl: item.fileAnswer?.url ?? null,
      fileName: item.fileAnswer?.fileName ?? null,
      awardedPoints: item.review?.awardedPoints ?? null,
      accepted: item.review?.accepted ?? null,
    })),
  };
}

function compareReviewRows(left: CourseManualReviewRow, right: CourseManualReviewRow) {
  if (left.status !== right.status) {
    return left.status === "pending" ? -1 : 1;
  }
  const leftMoment =
    left.status === "pending"
      ? left.submittedAt.getTime()
      : (left.reviewedAt ?? left.submittedAt).getTime();
  const rightMoment =
    right.status === "pending"
      ? right.submittedAt.getTime()
      : (right.reviewedAt ?? right.submittedAt).getTime();
  return rightMoment - leftMoment;
}

function truncateText(value: string | null, limit: number) {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
