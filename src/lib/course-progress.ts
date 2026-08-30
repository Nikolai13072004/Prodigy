import type { CourseItem, Quiz, QuizAttempt } from "@prisma/client";
import { COURSE_ITEM_LABELS, type CourseQuizGateMode } from "@/lib/constants";
import { getAttemptOutcomeMeta } from "@/modules/assessment/domain/attempt-outcome";

type AttemptLike = Pick<QuizAttempt, "outcome" | "correctAnswers" | "attemptNumber" | "score" | "completedAt">;
type QuizLike = Pick<Quiz, "maxAttempts" | "minCorrectAnswers">;
type CourseItemLike = Pick<CourseItem, "id" | "type" | "isRequired"> & {
  title?: string | null;
};
type StageStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export function getBestAttempt<T extends AttemptLike>(attempts: T[]) {
  return attempts
    .slice()
    .sort((left, right) => {
      if (right.correctAnswers !== left.correctAnswers) {
        return right.correctAnswers - left.correctAnswers;
      }
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.attemptNumber - left.attemptNumber;
    })[0] ?? null;
}

export function getQuizProgress<T extends AttemptLike>(quiz: QuizLike, attempts: T[]) {
  const hasInProgress = attempts.some((attempt) => attempt.outcome === "IN_PROGRESS");
  const hasPendingReview = attempts.some((attempt) => attempt.outcome === "PENDING_REVIEW");
  const completedAttempts = attempts.filter((attempt) => attempt.outcome !== "IN_PROGRESS");
  const bestAttempt = getBestAttempt(completedAttempts);
  const latestCompletedAttempt = completedAttempts
    .slice()
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())[0] ?? null;
  const attemptsUsed = completedAttempts.length;
  const bestOutcome = bestAttempt?.outcome ?? null;
  const status = getAttemptOutcomeMeta({
    bestOutcome,
    attemptsUsed,
    maxAttempts: quiz.maxAttempts,
    hasInProgress,
    hasPendingReview,
  });
  const isPassed = status.code === "PASSED";
  const attemptsExhausted = attemptsUsed >= quiz.maxAttempts;
  const isResolved = status.code === "PASSED" || status.code === "FAILED";

  return {
    attemptsUsed,
    attemptsLeft: Math.max(quiz.maxAttempts - attemptsUsed, 0),
    bestAttempt,
    latestCompletedAttempt,
    hasInProgress,
    hasPendingReview,
    status,
    isPassed,
    isResolved,
    isFailed: !isPassed && attemptsExhausted && !hasInProgress,
  };
}

function getCourseItemProgress(item: {
  type: string;
  title?: string | null;
  viewed?: boolean;
  materialProgress?: number;
  quiz?: (QuizLike & {
    attempts: AttemptLike[];
  }) | null;
}, quizGateMode: CourseQuizGateMode = "RESOLVED") {
  if (item.type === "QUIZ" && item.quiz) {
    const quizProgress = getQuizProgress(item.quiz, item.quiz.attempts);
    const isCompleted = quizGateMode === "PASSED" ? quizProgress.isPassed : quizProgress.isResolved;
    const percent = isCompleted ? 100 : quizProgress.hasInProgress || quizProgress.attemptsUsed > 0 ? 50 : 0;
    const status: StageStatus = isCompleted
      ? "COMPLETED"
      : quizProgress.hasInProgress || quizProgress.attemptsUsed > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";

    return {
      label: item.title || COURSE_ITEM_LABELS.QUIZ,
      percent,
      isCompleted,
      status,
    };
  }

  const percent = Math.max(Math.min(item.materialProgress ?? (item.viewed ? 100 : 0), 100), 0);
  const status: StageStatus =
    percent >= 100 ? "COMPLETED" : percent > 0 ? "IN_PROGRESS" : "NOT_STARTED";

  return {
    label: item.title || (COURSE_ITEM_LABELS[item.type as keyof typeof COURSE_ITEM_LABELS] ?? item.type),
    percent,
    isCompleted: percent >= 100,
    status,
  };
}

export function getCourseProgress(args: {
  courseTitle?: string | null;
  courseDescription?: string | null;
  quizGateMode?: CourseQuizGateMode;
  items: (CourseItemLike & {
    quiz?: (QuizLike & {
      attempts: AttemptLike[];
    }) | null;
    viewed?: boolean;
    materialProgress?: number;
  })[];
}) {
  const quizGateMode = args.quizGateMode ?? "RESOLVED";
  const stageEntries = args.items
    .filter((item) => item.isRequired)
    .map((item) => {
      const progress = getCourseItemProgress(item, quizGateMode);
      return {
        key: item.id,
        label: progress.label,
        percent: progress.percent,
        isCompleted: progress.isCompleted,
        status: progress.status,
      };
    });

  const requiredTotal = stageEntries.length;
  const completedRequired = stageEntries.filter((stage) => stage.isCompleted).length;
  const percent =
    requiredTotal === 0 ? 0 : Math.round(stageEntries.reduce((sum, stage) => sum + stage.percent, 0) / requiredTotal);

  const lectureStages = args.items
    .filter((item) => item.type !== "QUIZ")
    .map((item) => getCourseItemProgress(item, quizGateMode));
  const lectureTotal = lectureStages.length;
  const lectureCompleted = lectureStages.filter((stage) => stage.isCompleted).length;
  const lecturePercent =
    lectureTotal === 0 ? 0 : Math.round(lectureStages.reduce((sum, stage) => sum + stage.percent, 0) / lectureTotal);

  const quizStages = args.items
    .filter((item) => item.type === "QUIZ" && item.quiz)
    .map((item) => getCourseItemProgress(item, quizGateMode));
  const quizTotal = quizStages.length;
  const quizCompleted = quizStages.filter((stage) => stage.isCompleted).length;
  const quizPercent =
    quizTotal === 0 ? 0 : Math.round(quizStages.reduce((sum, stage) => sum + stage.percent, 0) / quizTotal);

  return {
    requiredTotal,
    completedRequired,
    percent,
    isCompleted: requiredTotal > 0 && completedRequired === requiredTotal,
    stages: {
      list: stageEntries,
    },
    lecture: {
      total: lectureTotal,
      completed: lectureCompleted,
      percent: lecturePercent,
      isCompleted: lectureTotal > 0 && lectureCompleted === lectureTotal,
    },
    quiz: {
      total: quizTotal,
      completed: quizCompleted,
      percent: quizPercent,
      isCompleted: quizTotal > 0 && quizCompleted === quizTotal,
    },
  };
}
