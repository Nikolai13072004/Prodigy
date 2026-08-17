import { COURSE_ITEM_LABELS, type CourseNavigationMode, type CourseQuizGateMode } from "@/lib/constants";
import { getQuizProgress } from "@/lib/course-progress";

type CourseItemViewLike = {
  progressPercent: number;
  viewedAt: Date;
};

type QuizAttemptLike = {
  id: string;
  outcome: string;
  correctAnswers: number;
  attemptNumber: number;
  score: number;
  maxScore: number;
  completedAt: Date;
};

type QuizLike = {
  id: string;
  description: string | null;
  maxAttempts: number;
  minCorrectAnswers: number;
  lockMaterialsOnStart: boolean;
  questions: { id: string }[];
  attempts: QuizAttemptLike[];
};

type CourseItemLike = {
  id: string;
  moduleId: string | null;
  orderIndex: number;
  type: string;
  title: string;
  content: string | null;
  fileUrl: string | null;
  totalSlides: number | null;
  isRequired: boolean;
  module?: {
    id: string;
    title: string;
    description: string | null;
    orderIndex: number;
  } | null;
  views: CourseItemViewLike[];
  quiz: QuizLike | null;
};

export type CourseOutlineEntry = {
  id: string;
  moduleId: string | null;
  orderIndex: number;
  moduleTitle: string | null;
  moduleDescription: string | null;
  moduleOrderIndex: number | null;
  type: string;
  typeLabel: string;
  title: string;
  content: string | null;
  fileUrl: string | null;
  totalSlides: number | null;
  isRequired: boolean;
  itemNumber: number;
  progressPercent: number;
  statusLabel: string;
  isCompleted: boolean;
  isLocked: boolean;
  lockReason: "SEQUENTIAL" | "QUIZ_STARTED" | null;
  viewedAt: Date | null;
  quiz: QuizLike | null;
};

export function buildCourseOutline(
  items: CourseItemLike[],
  navigationMode: CourseNavigationMode,
  options: {
    lockQuizzesUntilPreviousRequiredComplete?: boolean;
    lockMaterialsWhenQuizStarted?: boolean;
    quizGateMode?: CourseQuizGateMode;
  } = {}
): CourseOutlineEntry[] {
  const quizGateMode = options.quizGateMode ?? "RESOLVED";
  const quizProgressByItemId = new Map(
    items
      .filter((item) => Boolean(item.quiz))
      .map((item) => [item.id, getQuizProgress(item.quiz!, item.quiz!.attempts)] as const)
  );
  const hasStartedBlockingQuiz = options.lockMaterialsWhenQuizStarted === true &&
    items.some((item) => {
      const quizProgress = quizProgressByItemId.get(item.id);
      if (!quizProgress) return false;
      const isCompletedForGate = quizGateMode === "PASSED" ? quizProgress.isPassed : quizProgress.isResolved;

      return (
        item.type === "QUIZ" &&
        item.quiz?.lockMaterialsOnStart === true &&
        !isCompletedForGate &&
        (quizProgress.hasInProgress || quizProgress.hasPendingReview || quizProgress.attemptsUsed > 0)
      );
    });
  let hasBlockingIncompleteRequiredItem = false;

  return items.map((item, index) => {
    const materialProgress = item.views[0]?.progressPercent ?? 0;
    const viewedAt = item.quiz
      ? item.quiz.attempts.reduce<Date | null>(
          (latest, attempt) =>
            !latest || attempt.completedAt.getTime() > latest.getTime() ? attempt.completedAt : latest,
          null
        )
      : item.views[0]?.viewedAt ?? null;

    const quizProgress = item.quiz ? (quizProgressByItemId.get(item.id) ?? null) : null;
    const isCompleted = item.quiz
      ? quizGateMode === "PASSED"
        ? Boolean(quizProgress?.isPassed)
        : Boolean(quizProgress?.isResolved)
      : materialProgress >= 100;
    const progressPercent = item.quiz
      ? isCompleted
        ? 100
        : quizProgress && (quizProgress.attemptsUsed > 0 || quizProgress.hasInProgress)
          ? 50
          : 0
      : materialProgress;
    const shouldLockAfterIncompleteRequiredItem =
      navigationMode === "SEQUENTIAL" ||
      (options.lockQuizzesUntilPreviousRequiredComplete === true && item.type === "QUIZ");
    const isSequentiallyLocked =
      shouldLockAfterIncompleteRequiredItem && hasBlockingIncompleteRequiredItem && !isCompleted;
    const isLockedByStartedQuiz =
      hasStartedBlockingQuiz && item.type !== "QUIZ";
    const isLocked = isSequentiallyLocked || isLockedByStartedQuiz;
    const lockReason = isLockedByStartedQuiz
      ? "QUIZ_STARTED"
      : isSequentiallyLocked
        ? "SEQUENTIAL"
        : null;
    const statusLabel = isLocked
      ? "Заблокирован"
      : item.quiz
        ? getQuizStatusLabel(quizProgress?.status.code ?? "NOT_STARTED")
        : getMaterialStatusLabel(materialProgress);

    if (item.isRequired && !isCompleted) {
      hasBlockingIncompleteRequiredItem = true;
    }

    return {
      id: item.id,
      moduleId: item.moduleId,
      orderIndex: item.orderIndex,
      moduleTitle: item.module?.title ?? null,
      moduleDescription: item.module?.description ?? null,
      moduleOrderIndex: item.module?.orderIndex ?? null,
      type: item.type,
      typeLabel: COURSE_ITEM_LABELS[item.type as keyof typeof COURSE_ITEM_LABELS] ?? item.type,
      title: item.title,
      content: item.content,
      fileUrl: item.fileUrl,
      totalSlides: item.totalSlides,
      isRequired: item.isRequired,
      itemNumber: index + 1,
      progressPercent,
      statusLabel,
      isCompleted,
      isLocked,
      lockReason,
      viewedAt,
      quiz: item.quiz,
    };
  });
}

export function pickActiveCourseOutlineEntry(
  outline: CourseOutlineEntry[],
  options: {
    requestedItemId?: string | null;
    lastOpenedItemId?: string | null;
  }
) {
  const requested = options.requestedItemId ? outline.find((item) => item.id === options.requestedItemId) ?? null : null;
  if (requested && !requested.isLocked) return requested;

  const lastOpened = options.lastOpenedItemId
    ? outline.find((item) => item.id === options.lastOpenedItemId) ?? null
    : null;
  if (lastOpened && !lastOpened.isLocked) return lastOpened;

  const inProgress = outline.find((item) => !item.isLocked && item.progressPercent > 0 && !item.isCompleted);
  if (inProgress) return inProgress;

  const firstIncomplete = outline.find((item) => !item.isLocked && !item.isCompleted);
  if (firstIncomplete) return firstIncomplete;

  return outline.find((item) => !item.isLocked) ?? outline[0] ?? null;
}

function getMaterialStatusLabel(progressPercent: number) {
  if (progressPercent >= 100) return "Завершен";
  if (progressPercent > 0) return "В процессе";
  return "Не начат";
}

function getQuizStatusLabel(status: string) {
  if (status === "PASSED") return "Пройден";
  if (status === "PENDING_REVIEW") return "На проверке";
  if (status === "FAILED") return "Не пройден";
  if (status === "IN_PROGRESS") return "В работе";
  return "Не начат";
}
