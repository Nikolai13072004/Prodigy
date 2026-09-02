import { CourseCreationApplicationError } from "./creation-errors";
import type {
  CourseCreationAudit,
  CourseCreationRepository,
} from "./creation-ports";

// Use-case: копирование курса. Читает snapshot исходного (вне транзакции),
// в одной транзакции создаёт новый курс + модули + items с nested quiz+
// questions по маппингу moduleIdMap. Валидация minimal — title/description
// подставляются из исходника, если транспорт не передал.

export type CopyCourseActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type CopyCourseCommand = {
  sourceCourseId: string;
  ownerId: string;
  // Опциональные override'ы; если пусто — берутся из исходника.
  titleOverride: string | null;
  descriptionOverride: string | null;
  actor: CopyCourseActor;
  audit: { ipAddress: string | null; userAgent: string | null };
};

export type CopyCourseResult = {
  courseId: string;
  title: string;
  sourceTitle: string;
};

export type CopyCourseDeps = {
  repository: CourseCreationRepository;
};

export function createCopyCourse(deps: CopyCourseDeps) {
  const { repository } = deps;

  return async function copyCourse(
    command: CopyCourseCommand,
  ): Promise<CopyCourseResult> {
    if (!command.sourceCourseId) {
      throw new CourseCreationApplicationError(
        "VALIDATION_FAILED",
        "Выберите курс для копирования.",
      );
    }
    const source = await repository.findCourseForCopy(command.sourceCourseId);
    if (!source) {
      throw new CourseCreationApplicationError(
        "SOURCE_NOT_FOUND",
        "Курс для копирования не найден.",
      );
    }

    const title = command.titleOverride || `${source.title} — копия`;
    const description =
      command.descriptionOverride ?? source.description ?? "Копия курса.";

    return repository.transact(async (tx) => {
      const created = await tx.createCourse({
        title,
        description,
        requirements: source.requirements,
        targetAudience: source.targetAudience,
        category: source.category,
        difficultyLevel: source.difficultyLevel,
        durationMinutes: source.durationMinutes,
        tagsJson: source.tagsJson,
        thumbnailUrl: source.thumbnailUrl,
        coverUrl: source.coverUrl,
        navigationMode: source.navigationMode,
        quizGateMode: source.quizGateMode,
        completionMode: source.completionMode,
        statusFormat: source.statusFormat,
        gradedItemIdsJson: source.gradedItemIdsJson,
        resultViewMode: source.resultViewMode,
        ownerId: command.ownerId,
      });

      const moduleIdMap = new Map<string, string>();
      for (const sourceModule of source.modules) {
        const createdModule = await tx.createModule({
          courseId: created.id,
          title: sourceModule.title,
          description: sourceModule.description,
          orderIndex: sourceModule.orderIndex,
        });
        moduleIdMap.set(sourceModule.id, createdModule.id);
      }

      for (const item of source.items) {
        await tx.createItem({
          courseId: created.id,
          moduleId: item.moduleId
            ? moduleIdMap.get(item.moduleId) ?? null
            : null,
          orderIndex: item.orderIndex,
          type: item.type,
          title: item.title,
          content: item.content,
          fileUrl: item.fileUrl,
          totalSlides: item.totalSlides,
          presentationViewMode: item.presentationViewMode,
          isRequired: item.isRequired,
          quiz: item.quiz
            ? {
                description: item.quiz.description,
                maxAttempts: item.quiz.maxAttempts,
                minCorrectAnswers: item.quiz.minCorrectAnswers,
                questions: item.quiz.questions.map((question) => ({
                  orderIndex: question.orderIndex,
                  type: question.type,
                  prompt: question.prompt,
                  config: question.config,
                  points: question.points,
                })),
              }
            : null,
        });
      }

      const audit: CourseCreationAudit = {
        actorId: command.actor.id,
        actorLogin: command.actor.login,
        actorName: command.actor.name,
        action: "courses:copy",
        objectType: "course",
        objectId: created.id,
        objectLabel: created.title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          sourceCourseId: source.id,
          sourceTitle: source.title,
        },
      };
      await tx.recordEffects({ audit });

      return { courseId: created.id, title: created.title, sourceTitle: source.title };
    });
  };
}
