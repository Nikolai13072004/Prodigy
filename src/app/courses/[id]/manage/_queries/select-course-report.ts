export type AssignedCourseLearner = {
  id: string;
  name: string;
  login: string;
  department: string;
  assignmentSource: string;
  assignedAt: Date | null;
};

export type RequiredQuizStatus =
  | "NO_TEST"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "PASSED"
  | "FAILED";

export function selectRequiredQuizStatusReport(args: {
  assignedLearners: AssignedCourseLearner[];
  requiredQuizIds: string[];
  bestResults: Array<{ quizId: string; userId: string; status: string | null }>;
  inProgressAttempts: Array<{ quizId: string; userId: string }>;
  courseCompletionByUserId: Map<string, boolean>;
}) {
  const bestStatusByUserAndQuiz = new Map(
    args.bestResults.map((result) => [`${result.userId}:${result.quizId}`, result.status])
  );
  const inProgressSet = new Set(
    args.inProgressAttempts.map((attempt) => `${attempt.userId}:${attempt.quizId}`)
  );
  const summary = {
    assignedLearners: args.assignedLearners.length,
    passed: 0,
    failed: 0,
    inProgress: 0,
    pendingReview: 0,
    notStarted: 0,
  };

  if (args.requiredQuizIds.length === 0) {
    return {
      hasRequiredQuiz: false,
      rows: args.assignedLearners.map((learner) => ({
        ...learner,
        courseCompleted: args.courseCompletionByUserId.get(learner.id) ?? false,
        status: "NO_TEST" as const,
        statusLabel: "Нет теста",
      })),
      summary,
    };
  }

  const rows = args.assignedLearners.map((learner) => {
    const statuses = args.requiredQuizIds.map((quizId) => {
      const key = `${learner.id}:${quizId}`;
      const bestStatus = bestStatusByUserAndQuiz.get(key);
      if (bestStatus === "PASSED") return "PASSED";
      if (bestStatus === "FAILED") return "FAILED";
      if (bestStatus === "PENDING_REVIEW") return "PENDING_REVIEW";
      if (bestStatus === "IN_PROGRESS" || inProgressSet.has(key)) return "IN_PROGRESS";
      return "NOT_STARTED";
    });

    let status: RequiredQuizStatus;
    let statusLabel: string;
    if (statuses.every((value) => value === "PASSED")) {
      status = "PASSED";
      statusLabel = "Сдан";
      summary.passed += 1;
    } else if (statuses.some((value) => value === "FAILED")) {
      status = "FAILED";
      statusLabel = "Не сдан";
      summary.failed += 1;
    } else if (statuses.some((value) => value === "PENDING_REVIEW")) {
      status = "PENDING_REVIEW";
      statusLabel = "На проверке";
      summary.pendingReview += 1;
    } else if (statuses.some((value) => value === "IN_PROGRESS" || value === "PASSED")) {
      status = "IN_PROGRESS";
      statusLabel = "В работе";
      summary.inProgress += 1;
    } else {
      status = "NOT_STARTED";
      statusLabel = "Не начат";
      summary.notStarted += 1;
    }

    return {
      ...learner,
      courseCompleted: args.courseCompletionByUserId.get(learner.id) ?? false,
      status,
      statusLabel,
    };
  });

  return { hasRequiredQuiz: true, rows, summary };
}

export type CourseRequiredQuizReport = ReturnType<typeof selectRequiredQuizStatusReport>;
