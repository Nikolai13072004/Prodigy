import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type {
  QuizBuilderQuestionData,
  QuizBuilderRepository,
} from "./quiz-builder-ports";

// Use-case: обновление существующего вопроса. Тип не меняется (оригинал не
// поддерживает смену типа: транспорт сам парсит по question.type). Валидация
// совпадения типов остаётся здесь для защиты от рассинхрона транспорта.

export type UpdateQuizBuilderQuestionCommand = {
  courseId: string;
  quizId: string;
  questionId: string;
  data: QuizBuilderQuestionData;
};

export type UpdateQuizBuilderQuestionDeps = {
  repository: QuizBuilderRepository;
};

export function createUpdateQuizBuilderQuestion(
  deps: UpdateQuizBuilderQuestionDeps,
) {
  const { repository } = deps;

  return async function updateQuizBuilderQuestion(
    command: UpdateQuizBuilderQuestionCommand,
  ): Promise<void> {
    if (!command.data.prompt) {
      throw new QuizBuilderApplicationError(
        "VALIDATION_FAILED",
        "Введите текст вопроса",
      );
    }

    const quiz = await repository.findQuiz(command.courseId, command.quizId);
    if (!quiz) {
      throw new QuizBuilderApplicationError(
        "QUIZ_NOT_FOUND",
        "Тест не найден",
      );
    }
    const question = await repository.findQuestion(quiz.id, command.questionId);
    if (!question) {
      throw new QuizBuilderApplicationError(
        "QUESTION_NOT_FOUND",
        "Вопрос не найден",
      );
    }
    if (question.type !== command.data.type) {
      throw new QuizBuilderApplicationError(
        "VALIDATION_FAILED",
        "Нельзя менять тип существующего вопроса",
      );
    }

    await repository.transact(async (tx) => {
      await tx.updateQuestion({
        questionId: question.id,
        data: command.data,
      });
      await tx.markCourseContentChangedIfPublished(command.courseId);
    });
  };
}
