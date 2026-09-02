// Порт для команд редактирования теста (quiz builder). Отличается от
// assessment "delivery" ports тем, что тут запись/удаление вопросов и
// изменение настроек, а не работа с попытками. Держим отдельный файл, чтобы
// не смешивать назначения — assessment/delivery vs assessment/builder.

export type QuizBuilderQuestionKind =
  | "SINGLE_CHOICE"
  | "OPEN"
  | "MATCHING"
  | "FILE";

export type QuizBuilderQuestionData = {
  type: QuizBuilderQuestionKind;
  prompt: string;
  points: number;
  config: string; // JSON-строка, use-case сериализует
};

export type QuizBuilderSettings = {
  title: string;
  description: string | null;
  maxAttempts: number;
  minCorrectAnswers: number;
  timeLimitMinutes: number | null;
  questionPoolSize: number | null;
  retryDelayMinutes: number | null;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  lockMaterialsOnStart: boolean;
  trackSecurityEvents: boolean;
  resultViewMode: string;
};

export type QuizBuilderQuestionRecord = {
  id: string;
  quizId: string;
  type: string;
  config: string;
  orderIndex: number;
};

export interface QuizBuilderTransaction {
  updateSettings(input: {
    courseItemId: string;
    quizId: string;
    courseId: string;
    settings: QuizBuilderSettings;
  }): Promise<void>;
  createQuestion(input: {
    quizId: string;
    orderIndex: number;
    data: QuizBuilderQuestionData;
  }): Promise<{ id: string }>;
  createQuestionBatch(input: {
    quizId: string;
    startOrderIndex: number;
    items: QuizBuilderQuestionData[];
  }): Promise<Array<{ id: string }>>;
  updateQuestion(input: {
    questionId: string;
    data: QuizBuilderQuestionData;
  }): Promise<void>;
  // Атомарный swap orderIndex через "промежуточный" -1 — та же схема, что и
  // в оригинале (Prisma не даёт SWAP без промежуточного шага из-за @@unique).
  swapQuestionsOrder(a: string, aOrderIndex: number, b: string, bOrderIndex: number): Promise<void>;
  archiveQuestion(questionId: string, now: Date): Promise<void>;
  archiveQuizItem(courseItemId: string, now: Date): Promise<void>;
  markCourseContentChangedIfPublished(courseId: string): Promise<void>;
}

export interface QuizBuilderRepository {
  findQuiz(
    courseId: string,
    quizId: string,
  ): Promise<{ id: string; courseItemId: string } | null>;
  findQuestion(
    quizId: string,
    questionId: string,
  ): Promise<{ id: string; type: string; config: string } | null>;
  findExistingPrompts(quizId: string): Promise<Set<string>>;
  getQuestionsOrder(
    quizId: string,
  ): Promise<Array<{ id: string; orderIndex: number }>>;
  nextOrderIndex(quizId: string): Promise<number>;
  transact<T>(
    execute: (transaction: QuizBuilderTransaction) => Promise<T>,
  ): Promise<T>;
}
