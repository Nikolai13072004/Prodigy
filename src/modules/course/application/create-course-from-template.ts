import {
  getCourseTemplateBlueprint,
  planTemplateCourseItems,
} from "../domain/course-template-blueprint";
import type { CourseTemplateKey } from "@/lib/course-creation-options";
import { CourseCreationApplicationError } from "./creation-errors";
import type {
  CourseCreateData,
  CourseCreationAudit,
  CourseCreationRepository,
} from "./creation-ports";

// Use-case: создание курса по blueprint-шаблону. Blueprint выбирается по
// templateKey, разворачивается в план элементов через planTemplateCourseItems.
// Проверка ключа шаблона — в транспорте (isCourseTemplateKey).

export type CreateCourseFromTemplateActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type CreateCourseFromTemplateCommand = {
  data: CourseCreateData;
  templateKey: CourseTemplateKey;
  templateLabel: string;
  actor: CreateCourseFromTemplateActor;
  audit: { ipAddress: string | null; userAgent: string | null };
};

export type CreateCourseFromTemplateResult = {
  courseId: string;
  title: string;
};

export type CreateCourseFromTemplateDeps = {
  repository: CourseCreationRepository;
};

export function createCreateCourseFromTemplate(
  deps: CreateCourseFromTemplateDeps,
) {
  const { repository } = deps;

  return async function createCourseFromTemplate(
    command: CreateCourseFromTemplateCommand,
  ): Promise<CreateCourseFromTemplateResult> {
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

    const blueprint = getCourseTemplateBlueprint(command.templateKey);

    return repository.transact(async (tx) => {
      const created = await tx.createCourse(command.data);
      const moduleIds: string[] = [];
      for (const [index, moduleBlueprint] of blueprint.modules.entries()) {
        const moduleRecord = await tx.createModule({
          courseId: created.id,
          title: moduleBlueprint.title,
          description: moduleBlueprint.description ?? null,
          orderIndex: index,
        });
        moduleIds.push(moduleRecord.id);
      }

      for (const spec of planTemplateCourseItems(moduleIds, blueprint.items)) {
        await tx.createItem({
          courseId: created.id,
          moduleId: spec.moduleId,
          orderIndex: spec.orderIndex,
          type: spec.type,
          title: spec.title,
          content: spec.content,
          fileUrl: null,
          totalSlides: null,
          presentationViewMode: "PDF_PREVIEW",
          isRequired: spec.isRequired,
          quiz: spec.needsQuiz
            ? {
                description: null,
                maxAttempts: 2,
                minCorrectAnswers: 1,
                questions: [],
              }
            : null,
        });
      }

      const audit: CourseCreationAudit = {
        actorId: command.actor.id,
        actorLogin: command.actor.login,
        actorName: command.actor.name,
        action: "courses:create_from_template",
        objectType: "course",
        objectId: created.id,
        objectLabel: created.title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          templateKey: command.templateKey,
          templateLabel: command.templateLabel,
        },
      };
      await tx.recordEffects({ audit });

      return { courseId: created.id, title: created.title };
    });
  };
}
