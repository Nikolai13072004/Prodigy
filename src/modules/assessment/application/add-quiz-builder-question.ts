import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type {
  QuizBuilderQuestionData,
  QuizBuilderRepository,
} from "./quiz-builder-ports";

// Use-case: добавление вопроса в конец теста. Транспорт сам парсит форму по
// типу вопроса (parseOptions/parseOpenQuestion/parseMatching/parseFileQuestion)
// и передаёт готовые {type, prompt, points, config} — use-case пишет и
// возвращает id для параметра ?edit= редиректа.

export type AddQuizBuilderQuestionCommand = {
  courseId: string;
  quizId: string;
  data: QuizBuilderQuestionData;
};

export type AddQuizBuilderQuestionResult = {
  questionId: string;
};

export type AddQuizBuilderQuestionDeps = {
  repository: QuizBuilderRepository;
};

export function createAddQuizBuilderQuestion(
  deps: AddQuizBuilderQuestionDeps,
) {
  const { repository } = deps;

  return async function addQuizBuilderQuestion(
    command: AddQuizBuilderQuestionCommand,
  ): Promise<AddQuizBuilderQuestionResult> {
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

    // orderIndex вычисляется вне транзакции — то же поведение, что и в
    // оригинале. Гонка с параллельным add даёт временный duplicate,
    // но у Question нет @@unique(quizId, orderIndex), последующий move
    // разведёт индексы.
    const orderIndex = await repository.nextOrderIndex(quiz.id);

    return repository.transact(async (tx) => {
      const created = await tx.createQuestion({
        quizId: quiz.id,
        orderIndex,
        data: command.data,
      });
      await tx.markCourseContentChangedIfPublished(command.courseId);
      return { questionId: created.id };
    });
  };
}
