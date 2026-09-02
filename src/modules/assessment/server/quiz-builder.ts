import "server-only";

import { createAddQuizBuilderQuestion } from "../application/add-quiz-builder-question";
import { createDeleteQuizBuilderQuestion } from "../application/delete-quiz-builder-question";
import { createDeleteQuizFromBuilder } from "../application/delete-quiz-from-builder";
import { createImportQuizBuilderQuestions } from "../application/import-quiz-builder-questions";
import { createMoveQuizBuilderQuestion } from "../application/move-quiz-builder-question";
import { createSaveQuizBuilderSettings } from "../application/save-quiz-builder-settings";
import { createUpdateQuizBuilderQuestion } from "../application/update-quiz-builder-question";
import { prismaQuizBuilderRepository } from "../infrastructure/prisma-quiz-builder-repository";

const deps = { repository: prismaQuizBuilderRepository };

export const saveQuizBuilderSettings = createSaveQuizBuilderSettings(deps);
export const moveQuizBuilderQuestion = createMoveQuizBuilderQuestion(deps);
export const deleteQuizBuilderQuestion = createDeleteQuizBuilderQuestion(deps);
export const deleteQuizFromBuilder = createDeleteQuizFromBuilder(deps);
export const addQuizBuilderQuestion = createAddQuizBuilderQuestion(deps);
export const updateQuizBuilderQuestion = createUpdateQuizBuilderQuestion(deps);
export const importQuizBuilderQuestions = createImportQuizBuilderQuestions(deps);

// Тонкая query-обёртка: транспорту нужен текущий тип вопроса, чтобы вызвать
// нужный парсер формы перед updateQuestion. Отдельный use-case для этого
// избыточен — экспортируем прямую read-операцию.
export async function loadQuizBuilderQuestionForUpdate(
  courseId: string,
  quizId: string,
  questionId: string,
) {
  const quiz = await prismaQuizBuilderRepository.findQuiz(courseId, quizId);
  if (!quiz) return null;
  return prismaQuizBuilderRepository.findQuestion(quiz.id, questionId);
}
