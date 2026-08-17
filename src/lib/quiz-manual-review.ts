import { getRequiredCorrectAnswers } from "@/lib/quiz-pass-rule";
import { scoreQuiz } from "@/lib/score-quiz";

export type QuizQuestionSnapshot = {
  id: string;
  orderIndex: number;
  type: string;
  prompt: string;
  config: string;
  points: number;
};

export type FileAnswer = {
  url: string;
  fileName: string;
  size: number;
};

export type ManualReviewEntry = {
  awardedPoints: number;
  accepted: boolean;
};

export type ManualReviewData = Record<string, ManualReviewEntry>;

type OpenConfig = {
  reviewMode?: "AUTO" | "MANUAL";
};

type ManualReviewQuestion = {
  question: QuizQuestionSnapshot;
  answer: unknown;
  fileAnswer: FileAnswer | null;
  review: ManualReviewEntry | null;
};

export function parseQuestionSnapshot(raw: string | null | undefined) {
  if (!raw?.trim()) return [] as QuizQuestionSnapshot[];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as Partial<QuizQuestionSnapshot>;
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.type !== "string" ||
          typeof candidate.prompt !== "string" ||
          typeof candidate.config !== "string" ||
          typeof candidate.orderIndex !== "number" ||
          typeof candidate.points !== "number"
        ) {
          return null;
        }

        return {
          id: candidate.id,
          type: candidate.type,
          prompt: candidate.prompt,
          config: candidate.config,
          orderIndex: candidate.orderIndex,
          points: candidate.points,
        } satisfies QuizQuestionSnapshot;
      })
      .filter((item): item is QuizQuestionSnapshot => Boolean(item))
      .sort((left, right) => left.orderIndex - right.orderIndex);
  } catch {
    return [];
  }
}

export function parseAttemptAnswers(raw: string | null | undefined) {
  if (!raw?.trim()) return {} as Record<string, unknown>;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function parseManualReviewData(raw: string | null | undefined) {
  if (!raw?.trim()) return {} as ManualReviewData;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const entries = Object.entries(parsed as Record<string, unknown>)
      .map(([questionId, value]) => {
        if (!value || typeof value !== "object") return null;
        const candidate = value as Partial<ManualReviewEntry>;
        const awardedPoints =
          typeof candidate.awardedPoints === "number"
            ? candidate.awardedPoints
            : Number(candidate.awardedPoints ?? NaN);
        if (!Number.isFinite(awardedPoints) || typeof candidate.accepted !== "boolean") {
          return null;
        }

        return [
          questionId,
          {
            awardedPoints,
            accepted: candidate.accepted,
          },
        ] as const;
      })
      .filter((item): item is readonly [string, ManualReviewEntry] => Boolean(item));

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function parseQuestionConfig<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isManualReviewQuestion(question: Pick<QuizQuestionSnapshot, "type" | "config">) {
  if (question.type === "FILE") return true;
  if (question.type !== "OPEN") return false;

  const config = parseQuestionConfig<OpenConfig>(question.config, { reviewMode: "AUTO" });
  return config.reviewMode === "MANUAL";
}

export function parseFileAnswer(answer: unknown): FileAnswer | null {
  if (typeof answer !== "string" || !answer.trim()) return null;

  try {
    const parsed = JSON.parse(answer) as Partial<FileAnswer>;
    if (
      typeof parsed.url !== "string" ||
      !parsed.url.startsWith("/uploads/quiz-attachments/") ||
      typeof parsed.fileName !== "string" ||
      !parsed.fileName.trim() ||
      typeof parsed.size !== "number" ||
      !Number.isFinite(parsed.size) ||
      parsed.size < 1
    ) {
      return null;
    }

    return {
      url: parsed.url,
      fileName: parsed.fileName,
      size: parsed.size,
    };
  } catch {
    return null;
  }
}

export function getManualReviewQuestions(
  snapshot: QuizQuestionSnapshot[],
  answers: Record<string, unknown>,
  reviewData: ManualReviewData
) {
  return snapshot
    .filter((question) => isManualReviewQuestion(question))
    .map((question) => ({
      question,
      answer: answers[question.id],
      fileAnswer: question.type === "FILE" ? parseFileAnswer(answers[question.id]) : null,
      review: reviewData[question.id] ?? null,
    })) satisfies ManualReviewQuestion[];
}

export function buildManualReviewOutcome(args: {
  snapshot: QuizQuestionSnapshot[];
  answers: Record<string, unknown>;
  reviewData: ManualReviewData;
  minCorrectAnswers: number;
}): {
  score: number;
  maxScore: number;
  correctAnswers: number;
  totalQuestions: number;
  requiredCorrectAnswers: number;
  outcome: "PASSED" | "FAILED";
  autoScored: ReturnType<typeof scoreQuiz>;
  manualQuestions: ReturnType<typeof getManualReviewQuestions>;
} {
  const autoScored = scoreQuiz(args.snapshot, args.answers);
  const manualQuestions = getManualReviewQuestions(args.snapshot, args.answers, args.reviewData);

  let score = autoScored.score;
  let correctAnswers = autoScored.correctAnswers;

  for (const item of manualQuestions) {
    const review = args.reviewData[item.question.id];
    if (!review) {
      throw new Error("Не заполнена оценка для одного из вопросов с ручной проверкой");
    }

    const awardedPoints = Math.max(0, Math.min(item.question.points, Math.round(review.awardedPoints)));
    score += awardedPoints;
    if (review.accepted) {
      correctAnswers += 1;
    }
  }

  const requiredCorrectAnswers = getRequiredCorrectAnswers(
    args.minCorrectAnswers,
    autoScored.totalQuestions
  );

  return {
    score,
    maxScore: autoScored.maxScore,
    correctAnswers,
    totalQuestions: autoScored.totalQuestions,
    requiredCorrectAnswers,
    outcome: correctAnswers >= requiredCorrectAnswers ? "PASSED" : "FAILED",
    autoScored,
    manualQuestions,
  };
}
