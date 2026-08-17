import type { AssessmentQuestion } from "@/modules/assessment/domain/assessment";

function shuffleArray<T>(items: T[], random: () => number) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function shuffleQuestionAnswers(type: string, rawConfig: string, random: () => number) {
  try {
    const config = JSON.parse(rawConfig) as Record<string, unknown>;
    if (type === "SINGLE_CHOICE" && Array.isArray(config.options)) {
      const options = config.options.map((option, originalIndex) => ({ option, originalIndex }));
      const shuffled = shuffleArray(options, random);
      const correctIndex = typeof config.correctIndex === "number"
        ? shuffled.findIndex((item) => item.originalIndex === config.correctIndex)
        : config.correctIndex;
      return JSON.stringify({ ...config, options: shuffled.map((item) => item.option), correctIndex });
    }
    if (type === "MATCHING" && Array.isArray(config.right) && Array.isArray(config.correctPairs)) {
      const right = config.right.map((option, originalIndex) => ({ option, originalIndex }));
      const shuffled = shuffleArray(right, random);
      const indexByOriginal = new Map(shuffled.map((item, index) => [item.originalIndex, index]));
      return JSON.stringify({
        ...config,
        right: shuffled.map((item) => item.option),
        correctPairs: config.correctPairs.map((value) =>
          typeof value === "number" ? indexByOriginal.get(value) ?? value : value
        ),
      });
    }
    return rawConfig;
  } catch {
    return rawConfig;
  }
}

export function getEffectiveQuestionCount(totalQuestions: number, questionPoolSize?: number | null) {
  if (totalQuestions <= 0) return 0;
  if (!questionPoolSize || questionPoolSize < 1) return totalQuestions;
  return Math.max(1, Math.min(totalQuestions, questionPoolSize));
}

export function prepareAssessmentQuestions<T extends AssessmentQuestion>(
  questions: T[],
  options: {
    shuffleAnswers: boolean;
    shuffleQuestions: boolean;
    questionPoolSize?: number | null;
    random?: () => number;
  },
) {
  const random = options.random ?? Math.random;
  const poolSize = getEffectiveQuestionCount(questions.length, options.questionPoolSize);
  const ordered = poolSize < questions.length
    ? shuffleArray(questions, random).slice(0, poolSize)
    : options.shuffleQuestions
      ? shuffleArray(questions, random)
      : questions.slice();
  return ordered.map((question, orderIndex) => ({
    ...question,
    orderIndex,
    config: options.shuffleAnswers
      ? shuffleQuestionAnswers(question.type, question.config, random)
      : question.config,
  }));
}

export function getAssessmentRetryAvailableAt(
  attempts: Array<{ outcome: string; completedAt: Date }>,
  retryDelayMinutes: number | null | undefined,
) {
  if (!retryDelayMinutes || retryDelayMinutes < 1) return null;
  const latestFailure = attempts
    .filter((attempt) => attempt.outcome === "FAILED")
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())[0];
  return latestFailure
    ? new Date(latestFailure.completedAt.getTime() + retryDelayMinutes * 60_000)
    : null;
}
