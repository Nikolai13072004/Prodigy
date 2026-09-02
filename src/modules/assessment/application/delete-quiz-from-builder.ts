import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

// Use-case: soft-delete курсового элемента-теста целиком (archivedAt на
// CourseItem). Вопросы физически не трогаем — курс всё равно скрывается по
// archivedAt элемента, а вопросы остаются для истории попыток.

export type DeleteQuizFromBuilderCommand = {
  courseId: string;
  quizId: string;
  now: Date;
};

export type DeleteQuizFromBuilderDeps = {
  repository: QuizBuilderRepository;
};

export function createDeleteQuizFromBuilder(
  deps: DeleteQuizFromBuilderDeps,
) {
  const { repository } = deps;

  return async function deleteQuizFromBuilder(
    command: DeleteQuizFromBuilderCommand,
  ): Promise<void> {
    const quiz = await repository.findQuiz(command.courseId, command.quizId);
    if (!quiz) {
      throw new QuizBuilderApplicationError(
        "QUIZ_NOT_FOUND",
        "Тест не найден",
      );
    }

    await repository.transact(async (tx) => {
      await tx.archiveQuizItem(quiz.courseItemId, command.now);
      await tx.markCourseContentChangedIfPublished(command.courseId);
    });
  };
}
