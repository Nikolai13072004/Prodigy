import { ContentOrderingError, reorderContentItem } from "../domain/ordering";
import { ContentApplicationError } from "./errors";
import type {
  ContentRepository,
  CourseContentItemType,
  CourseCoverUpdate,
  SurveyItemSpecification,
} from "./ports";

const ITEM_TYPES = new Set<CourseContentItemType>(["TEXT", "VIDEO", "PDF", "QUIZ", "SURVEY"]);
const DEFAULT_MODULE_TITLE = "Материалы курса";

function requiredTitle(value: string, label: string) {
  const title = value.trim();
  if (!title) throw new ContentApplicationError("INVALID_INPUT", label);
  return title;
}

async function requireModule(
  transaction: Parameters<Parameters<ContentRepository["transact"]>[0]>[0],
  courseId: string,
  moduleId: string | null,
) {
  if (!moduleId) return null;
  const courseModule = await transaction.findActiveModule(courseId, moduleId);
  if (!courseModule) throw new ContentApplicationError("MODULE_NOT_FOUND", "Раздел не найден");
  return courseModule.id;
}

function validateItem(args: {
  type: CourseContentItemType;
  title: string;
  content: string | null;
  contentIsMeaningful: boolean;
  fileUrl: string | null;
  totalSlides: number | null;
}) {
  if (!ITEM_TYPES.has(args.type)) {
    throw new ContentApplicationError("INVALID_INPUT", "Выберите корректный тип материала");
  }
  requiredTitle(args.title, "Название материала обязательно");
  if (args.type === "TEXT" && (!args.content || !args.contentIsMeaningful)) {
    throw new ContentApplicationError("INVALID_INPUT", "Для страницы заполните содержание");
  }
  if ((args.type === "VIDEO" || args.type === "PDF") && !args.fileUrl) {
    throw new ContentApplicationError("INVALID_INPUT", "Для презентации и видео нужна ссылка на файл");
  }
  if (args.type === "PDF" && (!args.totalSlides || args.totalSlides < 1)) {
    throw new ContentApplicationError("INVALID_INPUT", "Для презентации требуется количество слайдов");
  }
}

export function createManageCourseContent(repository: ContentRepository) {
  return {
    createModule(command: {
      courseId: string;
      title: string;
      description: string | null;
    }) {
      return repository.transact(async (transaction) => {
        const title = requiredTitle(command.title, "Название раздела обязательно");
        const created = await transaction.createModule({
          ...command,
          title,
          orderIndex: await transaction.nextModuleOrderIndex(command.courseId),
        });
        await transaction.markContentChanged(command.courseId);
        return created;
      });
    },

    updateModule(command: {
      courseId: string;
      moduleId: string;
      title: string;
      description: string | null;
    }) {
      return repository.transact(async (transaction) => {
        const title = requiredTitle(command.title, "Название раздела обязательно");
        await requireModule(transaction, command.courseId, command.moduleId);
        await transaction.updateModule({ moduleId: command.moduleId, title, description: command.description });
        await transaction.markContentChanged(command.courseId);
      });
    },

    deleteModule(command: { courseId: string; moduleId: string; now?: Date }) {
      return repository.transact(async (transaction) => {
        await requireModule(transaction, command.courseId, command.moduleId);
        await transaction.archiveModule(command.courseId, command.moduleId, command.now ?? new Date());
        await transaction.markContentChanged(command.courseId);
      });
    },

    createItem(command: CourseCoverUpdate & {
      courseId: string;
      moduleId: string | null;
      type: CourseContentItemType;
      title: string;
      content: string | null;
      contentIsMeaningful: boolean;
      fileUrl: string | null;
      totalSlides: number | null;
      presentationViewMode: string;
      isRequired: boolean;
      maxAttempts: number;
      minCorrectAnswers: number;
      survey: SurveyItemSpecification | null;
    }) {
      return repository.transact(async (transaction) => {
        validateItem(command);
        if (command.type === "QUIZ" && (command.maxAttempts < 1 || command.minCorrectAnswers < 1)) {
          throw new ContentApplicationError("INVALID_INPUT", "Проверьте настройки попыток и порога теста");
        }
        if (command.type === "SURVEY" && !command.survey) {
          throw new ContentApplicationError("INVALID_INPUT", "Для опроса требуется спецификация шаблона");
        }
        let moduleId = await requireModule(transaction, command.courseId, command.moduleId);
        if (!command.moduleId && !(await transaction.findFirstActiveModule(command.courseId))) {
          const courseModule = await transaction.createModule({
            courseId: command.courseId,
            title: DEFAULT_MODULE_TITLE,
            description: null,
            orderIndex: await transaction.nextModuleOrderIndex(command.courseId),
          });
          moduleId = courseModule.id;
        }
        const created = await transaction.createItem({
          ...command,
          title: command.title.trim(),
          moduleId,
          orderIndex: await transaction.nextItemOrderIndex(command.courseId),
          quiz: command.type === "QUIZ"
            ? { maxAttempts: command.maxAttempts, minCorrectAnswers: command.minCorrectAnswers }
            : null,
          survey: command.type === "SURVEY" ? command.survey : null,
        });
        await transaction.markContentChanged(command.courseId);
        return created;
      });
    },

    updateItem(command: CourseCoverUpdate & {
      courseId: string;
      itemId: string;
      moduleId: string | null;
      title: string;
      content: string | null;
      contentIsMeaningful: boolean;
      fileUrl: string | null;
      totalSlides: number | null;
      presentationViewMode: string;
      isRequired: boolean;
    }) {
      return repository.transact(async (transaction) => {
        const item = await transaction.findActiveItem(command.courseId, command.itemId);
        if (!item) throw new ContentApplicationError("ITEM_NOT_FOUND", "Элемент курса не найден");
        const normalized = { ...command, type: item.type, title: command.title.trim() };
        validateItem(normalized);
        await requireModule(transaction, command.courseId, command.moduleId);
        await transaction.updateItem(normalized);
        await transaction.markContentChanged(command.courseId);
      });
    },

    moveItem(command: {
      courseId: string;
      itemId: string;
      direction: "up" | "down";
    }) {
      return repository.transact(async (transaction) => {
        const ordering = await transaction.loadOrdering(command.courseId);
        let nextOrder;
        try {
          nextOrder = reorderContentItem({ ...ordering, itemId: command.itemId, direction: command.direction });
        } catch (error) {
          if (error instanceof ContentOrderingError) {
            throw new ContentApplicationError(error.code, error.message);
          }
          throw error;
        }
        await transaction.updateItemOrder(nextOrder);
        await transaction.markContentChanged(command.courseId);
      });
    },

    deleteItem(command: { courseId: string; itemId: string; now?: Date }) {
      return repository.transact(async (transaction) => {
        const archived = await transaction.archiveItem(command.courseId, command.itemId, command.now ?? new Date());
        if (!archived) throw new ContentApplicationError("ITEM_NOT_FOUND", "Элемент курса не найден");
        await transaction.markContentChanged(command.courseId);
      });
    },

    updateQuizSettings(command: {
      courseId: string;
      quizId: string;
      maxAttempts: number;
      minCorrectAnswers: number;
      timeLimitMinutes: number | null;
      shuffleQuestions: boolean;
      shuffleAnswers: boolean;
      lockMaterialsOnStart: boolean;
    }) {
      return repository.transact(async (transaction) => {
        if (command.maxAttempts < 1 || command.minCorrectAnswers < 1) {
          throw new ContentApplicationError("INVALID_INPUT", "Проверьте настройки попыток и порога теста");
        }
        if (!(await transaction.findQuiz(command.courseId, command.quizId))) {
          throw new ContentApplicationError("ITEM_NOT_FOUND", "Тест не найден");
        }
        await transaction.updateQuizSettings(command);
        await transaction.markContentChanged(command.courseId);
      });
    },

    createQuestion(command: {
      courseId: string;
      quizId: string;
      type: string;
      prompt: string;
      config: string;
      points: number;
    }) {
      return repository.transact(async (transaction) => {
        if (!command.prompt.trim() || command.points < 1) {
          throw new ContentApplicationError("INVALID_INPUT", "Проверьте текст и баллы вопроса");
        }
        if (!(await transaction.findQuiz(command.courseId, command.quizId))) {
          throw new ContentApplicationError("ITEM_NOT_FOUND", "Тест не найден");
        }
        await transaction.createQuestion({
          quizId: command.quizId,
          type: command.type,
          prompt: command.prompt.trim(),
          config: command.config,
          points: command.points,
          orderIndex: await transaction.nextQuestionOrderIndex(command.quizId),
        });
        await transaction.markContentChanged(command.courseId);
      });
    },

    deleteQuestion(command: { courseId: string; questionId: string; now?: Date }) {
      return repository.transact(async (transaction) => {
        const archived = await transaction.archiveQuestion(
          command.courseId,
          command.questionId,
          command.now ?? new Date(),
        );
        if (!archived) throw new ContentApplicationError("ITEM_NOT_FOUND", "Вопрос не найден");
        await transaction.markContentChanged(command.courseId);
      });
    },
  };
}
