import { formatCourseSurveyTitle } from "@/lib/course-surveys";
import { planSurveyQuestionSync } from "../domain/survey-question-sync";
import { SurveyApplicationError } from "./errors";
import type {
  SurveyAudit,
  SurveyQuestionData,
  SurveyTemplateRepository,
} from "./survey-template-ports";

// Use-case: сохранение template опроса КУРСА (course-level). Возможно
// одновременно сохранение как reusable — тогда в аудите два события:
// course_survey:create|update и course_survey_template:create.

export type SaveCourseSurveyActor = {
  id: string;
  login: string | null;
  name: string | null;
};

export type SaveCourseSurveyAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type SaveCourseSurveyTemplateCommand = {
  courseId: string;
  actor: SaveCourseSurveyActor;
  audit: SaveCourseSurveyAuditContext;
  title: string; // до форматирования — форматируется здесь
  description: string | null;
  introImageUrl: string | null;
  introImageUploadBusy: boolean;
  isActive: boolean;
  isRequired: boolean;
  saveAsReusableTemplate: boolean;
  questions: Array<SurveyQuestionData & { id: string | null }>;
};

export type SaveCourseSurveyTemplateResult = {
  templateId: string;
  reusableTemplateId: string | null;
  isCreate: boolean;
};

export type SaveCourseSurveyTemplateDeps = {
  repository: SurveyTemplateRepository;
};

export function createSaveCourseSurveyTemplate(
  deps: SaveCourseSurveyTemplateDeps,
) {
  const { repository } = deps;

  return async function saveCourseSurveyTemplate(
    command: SaveCourseSurveyTemplateCommand,
  ): Promise<SaveCourseSurveyTemplateResult> {
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

    const title = formatCourseSurveyTitle(command.title);
    const existing = await repository.findCourseTemplate(command.courseId);

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
      const template = await tx.upsertCourseTemplate({
        courseId: command.courseId,
        existingId: existing?.id ?? null,
        fields,
      });

      await tx.syncCourseQuestions({
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

      const audits: SurveyAudit[] = [
        {
          actorId: command.actor.id,
          actorLogin: command.actor.login,
          actorName: command.actor.name,
          action: existing ? "course_survey:update" : "course_survey:create",
          objectType: "course_survey",
          objectId: template.id,
          objectLabel: title,
          ipAddress: command.audit.ipAddress,
          userAgent: command.audit.userAgent,
          metadata: {
            courseId: command.courseId,
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
