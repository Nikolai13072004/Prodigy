import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

// Use-case: soft-delete вопроса теста (archivedAt=now).
// Не сдвигаем orderIndex — они уникальны в scope quizId только среди живых,
// а порядок восстанавливается фильтром archivedAt IS NULL в чтении.

export type DeleteQuizBuilderQuestionCommand = {
  courseId: string;
  quizId: string;
  questionId: string;
  now: Date;
};

export type DeleteQuizBuilderQuestionDeps = {
  repository: QuizBuilderRepository;
};

export function createDeleteQuizBuilderQuestion(
  deps: DeleteQuizBuilderQuestionDeps,
) {
  const { repository } = deps;

  return async function deleteQuizBuilderQuestion(
    command: DeleteQuizBuilderQuestionCommand,
  ): Promise<void> {
    const quiz = await repository.findQuiz(command.courseId, command.quizId);
    if (!quiz) {
      throw new QuizBuilderApplicationError(
        "QUIZ_NOT_FOUND",
        "Тест не найден",
      );
    }
    const question = await repository.findQuestion(
      quiz.id,
      command.questionId,
    );
    if (!question) {
      throw new QuizBuilderApplicationError(
        "QUESTION_NOT_FOUND",
        "Вопрос не найден",
      );
    }

    await repository.transact(async (tx) => {
      await tx.archiveQuestion(question.id, command.now);
      await tx.markCourseContentChangedIfPublished(command.courseId);
    });
  };
}
