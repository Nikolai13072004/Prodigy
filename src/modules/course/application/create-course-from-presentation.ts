import { CourseCreationApplicationError } from "./creation-errors";
import type {
  CourseCreateData,
  CourseCreationAudit,
  CourseCreationRepository,
} from "./creation-ports";

// Use-case: создание курса из презентации. Одной транзакцией: course +
// module + PDF-item + опционально QUIZ-item.

export type CreateCourseFromPresentationActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type CreateCourseFromPresentationCommand = {
  data: CourseCreateData;
  moduleTitle: string;
  presentationTitle: string;
  fileUrl: string;
  totalSlides: number;
  presentationViewMode: string;
  includeQuiz: boolean;
  actor: CreateCourseFromPresentationActor;
  audit: { ipAddress: string | null; userAgent: string | null };
};

export type CreateCourseFromPresentationResult = {
  courseId: string;
  title: string;
  quizId: string | null;
};

export type CreateCourseFromPresentationDeps = {
  repository: CourseCreationRepository;
};

export function createCreateCourseFromPresentation(
  deps: CreateCourseFromPresentationDeps,
) {
  const { repository } = deps;

  return async function createCourseFromPresentation(
    command: CreateCourseFromPresentationCommand,
  ): Promise<CreateCourseFromPresentationResult> {
    if (!command.data.title) {
      throw new CourseCreationApplicationError(
        "VALIDATION_FAILED",
        "Название курса обязательно.",
      );
    }
    if (!command.data.description) {
      throw new CourseCreationApplicationError(
        "VALIDATION_FAILED",
        "Описание курса обязательно.",
      );
    }
    if (!command.fileUrl) {
      throw new CourseCreationApplicationError(
        "VALIDATION_FAILED",
        "Файл презентации не найден. Загрузите PDF/PPTX еще раз.",
      );
    }
    if (!command.totalSlides || command.totalSlides < 1) {
      throw new CourseCreationApplicationError(
        "VALIDATION_FAILED",
        "Не удалось определить количество слайдов. Загрузите PDF/PPTX еще раз.",
      );
    }

    return repository.transact(async (tx) => {
      const created = await tx.createCourse(command.data);
      const courseModule = await tx.createModule({
        courseId: created.id,
        title: command.moduleTitle,
        orderIndex: 0,
      });
      await tx.createItem({
        courseId: created.id,
        moduleId: courseModule.id,
        orderIndex: 0,
        type: "PDF",
        title: command.presentationTitle,
        content: null,
        fileUrl: command.fileUrl,
        totalSlides: command.totalSlides,
        presentationViewMode: command.presentationViewMode,
        isRequired: true,
        quiz: null,
      });
      let quizId: string | null = null;
      if (command.includeQuiz) {
        const quizItem = await tx.createItem({
          courseId: created.id,
          moduleId: courseModule.id,
          orderIndex: 1,
          type: "QUIZ",
          title: "Итоговый тест",
          content: null,
          fileUrl: null,
          totalSlides: null,
          presentationViewMode: "PDF_PREVIEW",
          isRequired: true,
          quiz: {
            description: null,
            maxAttempts: 2,
            minCorrectAnswers: 1,
            questions: [],
          },
        });
        quizId = quizItem.quizId;
      }

      const audit: CourseCreationAudit = {
        actorId: command.actor.id,
        actorLogin: command.actor.login,
        actorName: command.actor.name,
        action: "courses:create_from_presentation",
        objectType: "course",
        objectId: created.id,
        objectLabel: created.title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          fileUrl: command.fileUrl,
          totalSlides: command.totalSlides,
          presentationViewMode: command.presentationViewMode,
          includeQuiz: command.includeQuiz,
        },
      };
      await tx.recordEffects({ audit });

      return { courseId: created.id, title: created.title, quizId };
    });
  };
}
