import {
  getRequiredCorrectAnswers,
  scoreAssessment,
  type AssessmentQuestion,
} from "@/modules/assessment/domain/assessment";

export type ManualAssessmentReview = Record<string, {
  accepted: boolean;
  awardedPoints: number;
}>;

type OpenConfig = { reviewMode?: "AUTO" | "MANUAL" };

export class ManualAssessmentReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualAssessmentReviewError";
  }
}

function parseConfig<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function parseAssessmentSnapshot(raw: string): AssessmentQuestion[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is AssessmentQuestion => {
      if (!value || typeof value !== "object") return false;
      const question = value as Partial<AssessmentQuestion>;
      return typeof question.id === "string" &&
        typeof question.orderIndex === "number" &&
        typeof question.type === "string" &&
        typeof question.prompt === "string" &&
        typeof question.config === "string" &&
        typeof question.points === "number";
    }).sort((left, right) => left.orderIndex - right.orderIndex);
  } catch {
    return [];
  }
}

export function parseAssessmentAnswers(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function isManualAssessmentQuestion(question: Pick<AssessmentQuestion, "type" | "config">) {
  if (question.type === "FILE") return true;
  return question.type === "OPEN" && parseConfig<OpenConfig>(question.config).reviewMode === "MANUAL";
}

export function finalizeManualAssessmentReview(args: {
  questions: AssessmentQuestion[];
  answers: Record<string, unknown>;
  review: ManualAssessmentReview;
  minCorrectAnswers: number;
}) {
  const scored = scoreAssessment(args.questions, args.answers);
  const manualQuestions = args.questions.filter(isManualAssessmentQuestion);
  if (manualQuestions.length === 0) {
    throw new ManualAssessmentReviewError("В попытке нет вопросов с ручной проверкой.");
  }

  let score = scored.score;
  let correctAnswers = scored.correctAnswers;
  for (const question of manualQuestions) {
    const review = args.review[question.id];
    if (!review || typeof review.accepted !== "boolean" || !Number.isFinite(review.awardedPoints)) {
      throw new ManualAssessmentReviewError("Не заполнена оценка одного из вопросов с ручной проверкой.");
    }
    score += Math.max(0, Math.min(Math.max(question.points, 0), Math.round(review.awardedPoints)));
    if (review.accepted) correctAnswers += 1;
  }

  const requiredCorrectAnswers = getRequiredCorrectAnswers(
    args.minCorrectAnswers,
    scored.totalQuestions,
  );
  return {
    score,
    maxScore: scored.maxScore,
    correctAnswers,
    totalQuestions: scored.totalQuestions,
    requiredCorrectAnswers,
    outcome: correctAnswers >= requiredCorrectAnswers ? "PASSED" as const : "FAILED" as const,
  };
}
