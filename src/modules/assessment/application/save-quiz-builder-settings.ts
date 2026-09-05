import { RESULT_VIEW_MODES } from "@/lib/constants";
import { QuizBuilderApplicationError } from "./quiz-builder-errors";
import type {
  QuizBuilderRepository,
  QuizBuilderSettings,
} from "./quiz-builder-ports";

// Use-case: сохранение настроек builder'а теста (title/limits/misc + course
// resultViewMode). Одной транзакцией меняет три модели, чтобы окно UI
// показало консистентную картинку.

export type SaveQuizBuilderSettingsCommand = {
  courseId: string;
  quizId: string;
  settings: QuizBuilderSettings;
};

export type SaveQuizBuilderSettingsDeps = {
  repository: QuizBuilderRepository;
};

export function createSaveQuizBuilderSettings(
  deps: SaveQuizBuilderSettingsDeps,
) {
  const { repository } = deps;

  return async function saveQuizBuilderSettings(
    command: SaveQuizBuilderSettingsCommand,
  ): Promise<void> {
    if (!command.settings.title) {
      throw new QuizBuilderApplicationError(
        "VALIDATION_FAILED",
        "Введите название теста",
      );
    }
    if (
      !RESULT_VIEW_MODES.includes(
        command.settings.resultViewMode as (typeof RESULT_VIEW_MODES)[number],
      )
    ) {
      throw new QuizBuilderApplicationError(
        "VALIDATION_FAILED",
        "Выберите корректный режим показа результата",
      );
    }

    const quiz = await repository.findQuiz(command.courseId, command.quizId);
    if (!quiz) {
      throw new QuizBuilderApplicationError(
        "QUIZ_NOT_FOUND",
        "Тест не найден",
      );
    }

    await repository.transact(async (tx) => {
      await tx.updateSettings({
        courseItemId: quiz.courseItemId,
        quizId: quiz.id,
        courseId: command.courseId,
        settings: command.settings,
      });
      await tx.markCourseContentChangedIfPublished(command.courseId);
    });
  };
}
