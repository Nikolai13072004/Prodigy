import { formatCourseSurveyTitle } from "@/lib/course-surveys";
import { planSurveyQuestionSync } from "../domain/survey-question-sync";
import { SurveyApplicationError } from "./errors";
import type {
  SurveyAudit,
  SurveyQuestionData,
  SurveyTemplateRepository,
} from "./survey-template-ports";

// Use-case: сохранение template опроса-ITEM (в структуре курса). Отличается
// от course-level ещё двумя эффектами: обновляет сам courseItem (title/
// isRequired + очищает артефакты предыдущего типа) и помечает курс изменённым
// (для PUBLISHED-курсов).

export type SaveCourseItemSurveyActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type SaveCourseItemSurveyAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type SaveCourseItemSurveyTemplateCommand = {
  courseId: string;
  itemId: string;
  actor: SaveCourseItemSurveyActor;
  audit: SaveCourseItemSurveyAuditContext;
  title: string;
  description: string | null;
  introImageUrl: string | null;
  introImageUploadBusy: boolean;
  isActive: boolean;
  isRequired: boolean;
  saveAsReusableTemplate: boolean;
  questions: Array<SurveyQuestionData & { id: string | null }>;
};

export type SaveCourseItemSurveyTemplateResult = {
  templateId: string;
  reusableTemplateId: string | null;
  isCreate: boolean;
};

export type SaveCourseItemSurveyTemplateDeps = {
  repository: SurveyTemplateRepository;
};

export function createSaveCourseItemSurveyTemplate(
  deps: SaveCourseItemSurveyTemplateDeps,
) {
  const { repository } = deps;

  return async function saveCourseItemSurveyTemplate(
    command: SaveCourseItemSurveyTemplateCommand,
  ): Promise<SaveCourseItemSurveyTemplateResult> {
    if (command.introImageUploadBusy) {
      throw new SurveyApplicationError(
        "INTRO_IMAGE_BUSY",
        "Дождитесь окончания загрузки фонового изображения и сохраните опрос еще раз.",
      );
    }
    if (command.questions.length === 0) {
      throw new SurveyApplicationError(
        "VALIDATION_FAILED",
        "Добавьте хотя бы один вопрос в опрос.",
      );
    }

    const item = await repository.findItem(command.courseId, command.itemId);
    if (!item || item.type !== "SURVEY") {
      throw new SurveyApplicationError("ITEM_NOT_SURVEY", "Опрос не найден.");
    }

    const title = formatCourseSurveyTitle(command.title);
    const existing = await repository.findItemTemplate(command.itemId);

    const questionsData: SurveyQuestionData[] = command.questions.map(
      (question) => ({
        title: question.title,
        type: question.type,
        optionsJson: question.optionsJson,
        isRequired: question.isRequired,
      }),
    );
    const sync = planSurveyQuestionSync(
      existing?.existingQuestionIds ?? [],
      command.questions,
    );

    const fields = {
      title,
      description: command.description,
      introImageUrl: command.introImageUrl,
      isActive: command.isActive,
      isRequired: command.isRequired,
    };

    return repository.transact(async (tx) => {
      // Обновление CourseItem — тот же tx, чтобы title/isRequired не разошлись
      // с template.
      await tx.updateCourseItem(command.itemId, {
        title,
        isRequired: command.isRequired,
      });

      const template = await tx.upsertItemTemplate({
        courseId: command.courseId,
        courseItemId: command.itemId,
        existingId: existing?.id ?? null,
        fields,
      });

      await tx.syncItemQuestions({
        templateId: template.id,
        ops: sync.ops,
        toDeleteIds: sync.toDeleteIds,
        questions: questionsData,
      });

      let reusableTemplateId: string | null = null;
      if (command.saveAsReusableTemplate) {
        const reusable = await tx.createReusableTemplate({
          title,
          description: command.description,
          introImageUrl: command.introImageUrl,
          isRequired: command.isRequired,
          sourceCourseId: command.courseId,
          createdById: command.actor.id,
          questions: questionsData,
        });
        reusableTemplateId = reusable.id;
      }

      await tx.markCourseContentChangedIfPublished(command.courseId);

      const audits: SurveyAudit[] = [
        {
          actorId: command.actor.id,
          actorLogin: command.actor.login,
          actorName: command.actor.name,
          action: existing
            ? "course_item_survey:update"
            : "course_item_survey:create",
          objectType: "course_item_survey",
          objectId: template.id,
          objectLabel: title,
          ipAddress: command.audit.ipAddress,
          userAgent: command.audit.userAgent,
          metadata: {
            courseId: command.courseId,
            courseItemId: command.itemId,
            isActive: command.isActive,
            isRequired: command.isRequired,
            hasIntroImage: Boolean(command.introImageUrl),
            questionsCount: command.questions.length,
            savedAsReusableTemplate: Boolean(reusableTemplateId),
          },
        },
      ];
      if (reusableTemplateId) {
        audits.push({
          actorId: command.actor.id,
          actorLogin: command.actor.login,
          actorName: command.actor.name,
          action: "course_survey_template:create",
          objectType: "course_survey_template",
          objectId: reusableTemplateId,
          objectLabel: title,
          ipAddress: command.audit.ipAddress,
          userAgent: command.audit.userAgent,
          metadata: {
            courseId: command.courseId,
            sourceCourseId: command.courseId,
            courseItemId: command.itemId,
            hasIntroImage: Boolean(command.introImageUrl),
            questionsCount: command.questions.length,
          },
        });
      }
      await tx.recordEffects({ audits });

      return {
        templateId: template.id,
        reusableTemplateId,
        isCreate: !existing,
      };
    });
  };
}
