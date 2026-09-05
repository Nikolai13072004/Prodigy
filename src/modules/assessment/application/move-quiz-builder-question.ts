import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type { QuizBuilderRepository } from "./quiz-builder-ports";

// Use-case: сдвиг вопроса на позицию вверх/вниз. Обмениваем orderIndex с
// соседним по списку. Если сосед за границей — no-op.

export type MoveQuizBuilderQuestionDirection = "UP" | "DOWN";

export type MoveQuizBuilderQuestionCommand = {
  courseId: string;
  quizId: string;
  questionId: string;
  direction: MoveQuizBuilderQuestionDirection;
};

export type MoveQuizBuilderQuestionResult = {
  moved: boolean;
};

export type MoveQuizBuilderQuestionDeps = {
  repository: QuizBuilderRepository;
};

export function createMoveQuizBuilderQuestion(
  deps: MoveQuizBuilderQuestionDeps,
) {
  const { repository } = deps;

  return async function moveQuizBuilderQuestion(
    command: MoveQuizBuilderQuestionCommand,
  ): Promise<MoveQuizBuilderQuestionResult> {
    const quiz = await repository.findQuiz(command.courseId, command.quizId);
    if (!quiz) {
      throw new QuizBuilderApplicationError(
        "QUIZ_NOT_FOUND",
        "Тест не найден",
      );
    }

    const questions = await repository.getQuestionsOrder(quiz.id);
    const currentIndex = questions.findIndex(
      (question) => question.id === command.questionId,
    );
    if (currentIndex < 0) {
      throw new QuizBuilderApplicationError(
        "QUESTION_NOT_FOUND",
        "Вопрос не найден",
      );
    }

    const swapIndex =
      command.direction === "UP" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= questions.length) {
      return { moved: false };
    }

    const current = questions[currentIndex];
    const target = questions[swapIndex];

    await repository.transact(async (tx) => {
      await tx.swapQuestionsOrder(
        current.id,
        current.orderIndex,
        target.id,
        target.orderIndex,
      );
      await tx.markCourseContentChangedIfPublished(command.courseId);
    });

    return { moved: true };
  };
}
