import { parseAttemptAnswers, parseFileAnswer, parseQuestionConfig, parseQuestionSnapshot } from "@/lib/quiz-manual-review";
import prisma from "@/lib/prisma";
import { scoreOneQuestion } from "@/lib/score-quiz";
import { buildXlsxWorkbook } from "@/lib/xlsx";

export type AnswersAnalysisFilters = {
  courseId: string;
};

export type AnswersAnalysisAttemptRow = {
  attemptId: string;
  completedAt: Date;
  learnerId: string;
  learnerName: string;
  learnerLogin: string;
  quizId: string;
  quizTitle: string;
  attemptNumber: number;
  score: number;
  maxScore: number;
  scorePercent: number;
  outcome: "PASSED" | "FAILED";
};

export type AnswersAnalysisQuestionAnswerRow = {
  value: string;
  count: number;
  percent: number;
  correctCount: number;
  incorrectCount: number;
  unknownCount: number;
};

export type AnswersAnalysisQuestionRow = {
  quizId: string;
  quizTitle: string;
  questionId: string;
  questionOrder: number;
  questionType: string;
  prompt: string;
  hasImage: boolean;
  attemptsCount: number;
  answers: AnswersAnalysisQuestionAnswerRow[];
};

export type AnswersAnalysisData = {
  course: {
    id: string;
    title: string;
  };
  summary: {
    averageScorePercent: number;
    passingScorePercent: number;
    attemptsTotal: number;
    uniqueLearners: number;
    passedAttempts: number;
    failedAttempts: number;
  };
  attempts: AnswersAnalysisAttemptRow[];
  questionRows: AnswersAnalysisQuestionRow[];
};

export async function getAnswersAnalysisData(filters: AnswersAnalysisFilters): Promise<AnswersAnalysisData | null> {
  const course = await prisma.course.findFirst({
    where: {
      id: filters.courseId,
      status: "PUBLISHED",
    },
    select: {
      id: true,
      title: true,
      items: {
        where: { archivedAt: null },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          title: true,
          quiz: {
            select: {
              id: true,
              minCorrectAnswers: true,
              questions: {
                where: { archivedAt: null },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!course) return null;

  const quizItems = course.items.filter((item) => Boolean(item.quiz));
  const quizIds = quizItems.map((item) => item.quiz!.id);

  if (quizIds.length === 0) {
    return {
      course: { id: course.id, title: course.title },
      summary: {
        averageScorePercent: 0,
        passingScorePercent: 0,
        attemptsTotal: 0,
        uniqueLearners: 0,
        passedAttempts: 0,
        failedAttempts: 0,
      },
      attempts: [],
      questionRows: [],
    };
  }

  const attempts = await prisma.quizAttempt.findMany({
    where: {
      quizId: { in: quizIds },
    },
    orderBy: [{ completedAt: "desc" }, { attemptNumber: "desc" }],
    select: {
      id: true,
      quizId: true,
      userId: true,
      attemptNumber: true,
      answers: true,
      questionSnapshot: true,
      score: true,
      maxScore: true,
      outcome: true,
      completedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          login: true,
        },
      },
      quiz: {
        select: {
          id: true,
          courseItem: {
            select: {
              title: true,
            },
          },
        },
      },
    },
  });

  const passThresholds = quizItems
    .map((item) => {
      const quiz = item.quiz;
      if (!quiz) return null;
      const totalQuestions = quiz.questions.length;
      if (totalQuestions <= 0) return null;
      return (quiz.minCorrectAnswers / totalQuestions) * 100;
    })
    .filter((value): value is number => value !== null);

  const attemptsRows: AnswersAnalysisAttemptRow[] = attempts.map((attempt) => {
    const scorePercent = attempt.maxScore > 0 ? round1((attempt.score / attempt.maxScore) * 100) : 0;
    return {
      attemptId: attempt.id,
      completedAt: attempt.completedAt,
      learnerId: attempt.user.id,
      learnerName: attempt.user.name,
      learnerLogin: attempt.user.login,
      quizId: attempt.quiz.id,
      quizTitle: attempt.quiz.courseItem.title,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      maxScore: attempt.maxScore,
      scorePercent,
      outcome: attempt.outcome === "PASSED" ? "PASSED" : "FAILED",
    };
  });

  const questionMap = new Map<string, {
    quizId: string;
    quizTitle: string;
    questionId: string;
    questionOrder: number;
    questionType: string;
    prompt: string;
    hasImage: boolean;
    attemptsCount: number;
    answers: Map<string, { count: number; correctCount: number; incorrectCount: number; unknownCount: number }>;
  }>();

  for (const attempt of attempts) {
    const snapshot = parseQuestionSnapshot(attempt.questionSnapshot);
    const answers = parseAttemptAnswers(attempt.answers);

    for (const question of snapshot) {
      const key = `${attempt.quizId}:${question.id}`;
      const current = questionMap.get(key) ?? {
        quizId: attempt.quizId,
        quizTitle: attempt.quiz.courseItem.title,
        questionId: question.id,
        questionOrder: question.orderIndex,
        questionType: question.type,
        prompt: normalizePrompt(question.prompt),
        hasImage: containsImage(question.prompt),
        attemptsCount: 0,
        answers: new Map<string, { count: number; correctCount: number; incorrectCount: number; unknownCount: number }>(),
      };

      current.attemptsCount += 1;
      const rawAnswer = answers[question.id];
      const normalizedAnswer = normalizeAnswerValue(question.type, question.config, rawAnswer);

      const score = scoreOneQuestion(
        {
          id: question.id,
          type: question.type,
          config: question.config,
          points: question.points,
        },
        rawAnswer
      );
      const bucket = current.answers.get(normalizedAnswer) ?? {
        count: 0,
        correctCount: 0,
        incorrectCount: 0,
        unknownCount: 0,
      };
      bucket.count += 1;
      if (score.requiresManualReview) {
        bucket.unknownCount += 1;
      } else if (score.isCorrect) {
        bucket.correctCount += 1;
      } else {
        bucket.incorrectCount += 1;
      }
      current.answers.set(normalizedAnswer, bucket);
      questionMap.set(key, current);
    }
  }

  const questionRows: AnswersAnalysisQuestionRow[] = Array.from(questionMap.values())
    .map((item) => ({
      quizId: item.quizId,
      quizTitle: item.quizTitle,
      questionId: item.questionId,
      questionOrder: item.questionOrder,
      questionType: item.questionType,
      prompt: item.prompt,
      hasImage: item.hasImage,
      attemptsCount: item.attemptsCount,
      answers: Array.from(item.answers.entries())
        .map(([value, stats]) => ({
          value,
          count: stats.count,
          percent: item.attemptsCount > 0 ? round1((stats.count / item.attemptsCount) * 100) : 0,
          correctCount: stats.correctCount,
          incorrectCount: stats.incorrectCount,
          unknownCount: stats.unknownCount,
        }))
        .sort((left, right) => right.count - left.count),
    }))
    .sort((left, right) => {
      const byQuiz = left.quizTitle.localeCompare(right.quizTitle, "ru", { sensitivity: "base", numeric: true });
      if (byQuiz !== 0) return byQuiz;
      return left.questionOrder - right.questionOrder;
    });

  const summary = {
    averageScorePercent: attemptsRows.length
      ? round1(attemptsRows.reduce((sum, row) => sum + row.scorePercent, 0) / attemptsRows.length)
      : 0,
    passingScorePercent: passThresholds.length ? round1(passThresholds.reduce((sum, value) => sum + value, 0) / passThresholds.length) : 0,
    attemptsTotal: attemptsRows.length,
    uniqueLearners: new Set(attemptsRows.map((row) => row.learnerId)).size,
    passedAttempts: attemptsRows.filter((row) => row.outcome === "PASSED").length,
    failedAttempts: attemptsRows.filter((row) => row.outcome === "FAILED").length,
  };

  return {
    course: {
      id: course.id,
      title: course.title,
    },
    summary,
    attempts: attemptsRows,
    questionRows,
  };
}

export function buildAnswersAnalysisXlsx(data: AnswersAnalysisData) {
  const rows: Array<Array<string | number>> = [
    ["Курс", data.course.title],
    ["Средний балл, %", data.summary.averageScorePercent],
    ["Проходной балл, %", data.summary.passingScorePercent],
    ["Всего попыток", data.summary.attemptsTotal],
    ["Уникальные прохождения", data.summary.uniqueLearners],
    ["Пройдено", data.summary.passedAttempts],
    ["Не пройдено", data.summary.failedAttempts],
    [],
    ["Детали попыток"],
    ["Дата", "Сотрудник", "Логин", "Материал", "Попытка", "Баллы", "Процент", "Исход"],
    ...data.attempts.map((row) => [
      formatDateTime(row.completedAt),
      row.learnerName,
      row.learnerLogin,
      row.quizTitle,
      row.attemptNumber,
      `${row.score}/${row.maxScore}`,
      row.scorePercent,
      row.outcome === "PASSED" ? "Пройден" : "Не пройден",
    ]),
    [],
    ["Анализ ответов"],
    ["Материал", "Вопрос", "Тип", "Ответ", "Количество", "Процент", "Верных", "Неверных", "Ручная проверка"],
  ];

  for (const question of data.questionRows) {
    if (question.answers.length === 0) {
      rows.push([
        question.quizTitle,
        `${question.questionOrder + 1}. ${question.prompt}`,
        question.questionType,
        "Нет ответов",
        0,
        0,
        0,
        0,
        0,
      ]);
      continue;
    }

    for (const answer of question.answers) {
      rows.push([
        question.quizTitle,
        `${question.questionOrder + 1}. ${question.prompt}`,
        question.questionType,
        answer.value,
        answer.count,
        answer.percent,
        answer.correctCount,
        answer.incorrectCount,
        answer.unknownCount,
      ]);
    }
  }

  return buildXlsxWorkbook({
    sheetName: "Анализ ответов",
    rows,
  });
}

function normalizePrompt(prompt: string) {
  const compact = prompt
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact || "Без текста вопроса";
}

function containsImage(prompt: string) {
  return /<img\s/i.test(prompt) || /!\[[^\]]*\]\([^\)]+\)/.test(prompt);
}

function normalizeAnswerValue(type: string, configRaw: string, rawAnswer: unknown) {
  if (rawAnswer === null || rawAnswer === undefined || rawAnswer === "") return "Нет ответа";

  if (type === "FILE") {
    const parsed = parseFileAnswer(rawAnswer);
    if (parsed) return `Файл: ${parsed.fileName}`;
    return "Файл загружен";
  }

  if (type === "MATCHING") {
    if (!Array.isArray(rawAnswer)) return "Нет ответа";
    const cfg = parseQuestionConfig<{ left?: string[]; right?: string[] }>(configRaw, {});
    const left = Array.isArray(cfg.left) ? cfg.left.map(String) : [];
    const right = Array.isArray(cfg.right) ? cfg.right.map(String) : [];
    const pairs = rawAnswer
      .map((value, index) => {
        const rightIndex = parseInt(String(value), 10);
        const leftLabel = left[index] ?? `Позиция ${index + 1}`;
        const rightLabel = Number.isFinite(rightIndex) && right[rightIndex] ? right[rightIndex] : "—";
        return `${leftLabel} -> ${rightLabel}`;
      })
      .join("; ");
    return pairs || "Нет ответа";
  }

  if (type === "SINGLE_CHOICE") {
    const cfg = parseQuestionConfig<{ options?: string[] }>(configRaw, {});
    const options = Array.isArray(cfg.options) ? cfg.options.map(String) : [];
    const index = typeof rawAnswer === "number" ? rawAnswer : parseInt(String(rawAnswer), 10);
    if (Number.isFinite(index) && options[index]) return options[index];
    return String(rawAnswer).trim() || "Нет ответа";
  }

  if (Array.isArray(rawAnswer)) {
    return rawAnswer.map((value) => String(value)).join(", ") || "Нет ответа";
  }

  return String(rawAnswer).trim() || "Нет ответа";
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
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
