import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type {
  QuizBuilderQuestionData,
  QuizBuilderRepository,
} from "./quiz-builder-ports";

// Use-case: пакетный импорт вопросов (сейчас — из DOCX; парсинг файла —
// в транспорте через lib/quiz-docx-import). Использует dedup по prompt против
// уже существующих в тесте вопросов.

export type ImportQuizBuilderQuestionsCommand = {
  courseId: string;
  quizId: string;
  questions: QuizBuilderQuestionData[];
};

export type ImportQuizBuilderQuestionsResult = {
  totalParsed: number;
  createdCount: number;
  duplicatesSkipped: number;
  firstCreatedQuestionId: string | null;
};

export type ImportQuizBuilderQuestionsDeps = {
  repository: QuizBuilderRepository;
};

export function createImportQuizBuilderQuestions(
  deps: ImportQuizBuilderQuestionsDeps,
) {
  const { repository } = deps;

  return async function importQuizBuilderQuestions(
    command: ImportQuizBuilderQuestionsCommand,
  ): Promise<ImportQuizBuilderQuestionsResult> {
    if (command.questions.length === 0) {
      throw new QuizBuilderApplicationError(
        "VALIDATION_FAILED",
        "Не удалось найти вопросы. Формат: абзац с вопросом, затем варианты ответов, правильный вариант выделен жирным.",
      );
    }

    const quiz = await repository.findQuiz(command.courseId, command.quizId);
    if (!quiz) {
      throw new QuizBuilderApplicationError(
        "QUIZ_NOT_FOUND",
        "Тест не найден",
      );
    }

    const existingPrompts = await repository.findExistingPrompts(quiz.id);
    const seen = new Set(existingPrompts);
    const toCreate: QuizBuilderQuestionData[] = [];
    for (const question of command.questions) {
      if (seen.has(question.prompt)) continue;
      seen.add(question.prompt);
      toCreate.push(question);
    }

    if (toCreate.length === 0) {
      throw new QuizBuilderApplicationError(
        "VALIDATION_FAILED",
        `Все ${command.questions.length} вопросов уже есть в тесте`,
      );
    }

    const startOrderIndex = await repository.nextOrderIndex(quiz.id);

    const created = await repository.transact(async (tx) => {
      const rows = await tx.createQuestionBatch({
        quizId: quiz.id,
        startOrderIndex,
        items: toCreate,
      });
      await tx.markCourseContentChangedIfPublished(command.courseId);
      return rows;
    });

    return {
      totalParsed: command.questions.length,
      createdCount: created.length,
      duplicatesSkipped: command.questions.length - created.length,
      firstCreatedQuestionId: created[0]?.id ?? null,
    };
  };
}
