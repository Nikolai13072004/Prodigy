import { CourseCreationApplicationError } from "./creation-errors";
import type {
  CourseCreateData,
  CourseCreationAudit,
  CourseCreationRepository,
} from "./creation-ports";

// Use-case: создание пустого курса. Валидация title/description → одна
// транзакция course.create + audit.

export type CreateCourseActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type CreateCourseCommand = {
  data: CourseCreateData;
  actor: CreateCourseActor;
  audit: { ipAddress: string | null; userAgent: string | null };
};

export type CreateCourseResult = {
  courseId: string;
  title: string;
};

export type CreateCourseDeps = {
  repository: CourseCreationRepository;
};

export function createCreateCourse(deps: CreateCourseDeps) {
  const { repository } = deps;

  return async function createCourse(
    command: CreateCourseCommand,
  ): Promise<CreateCourseResult> {
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

    return repository.transact(async (tx) => {
      const created = await tx.createCourse(command.data);
      const audit: CourseCreationAudit = {
        actorId: command.actor.id,
        actorLogin: command.actor.login,
        actorName: command.actor.name,
        action: "courses:create",
        objectType: "course",
        objectId: created.id,
        objectLabel: created.title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          description: command.data.description,
          category: command.data.category,
          difficultyLevel: command.data.difficultyLevel,
          durationMinutes: command.data.durationMinutes,
          thumbnailUrl: command.data.thumbnailUrl,
          coverUrl: command.data.coverUrl,
          ownerId: command.data.ownerId,
        },
      };
      await tx.recordEffects({ audit });
      return { courseId: created.id, title: created.title };
    });
  };
}
