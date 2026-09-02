import { formatCourseSurveyTitle } from "@/lib/course-surveys";
import { SurveyApplicationError } from "./errors";
import type {
  SurveyAudit,
  SurveyTemplateRepository,
} from "./survey-template-ports";

// Use-case: применить reusable-шаблон к template опроса КУРСА. Все вопросы
// целевого template полностью заменяются вопросами из reusable (replace).

export type ApplyReusableCourseSurveyCommand = {
  courseId: string;
  reusableTemplateId: string;
  actor: { id: string; login: string | null; name: string | null };
  audit: { ipAddress: string | null; userAgent: string | null };
};

export type ApplyReusableCourseSurveyResult = {
  templateId: string;
  reusableTitle: string;
  reusableTemplateId: string;
};

export type ApplyReusableCourseSurveyDeps = {
  repository: SurveyTemplateRepository;
};

export function createApplyReusableCourseSurveyTemplate(
  deps: ApplyReusableCourseSurveyDeps,
) {
  const { repository } = deps;

  return async function applyReusableCourseSurveyTemplate(
    command: ApplyReusableCourseSurveyCommand,
  ): Promise<ApplyReusableCourseSurveyResult> {
    if (!command.reusableTemplateId) {
      throw new SurveyApplicationError(
        "VALIDATION_FAILED",
        "Выберите шаблон опроса.",
      );
    }

    const reusable = await repository.findReusableTemplate(
      command.reusableTemplateId,
    );
    if (!reusable || reusable.questions.length === 0) {
      throw new SurveyApplicationError(
        "REUSABLE_NOT_FOUND",
        "Шаблон опроса не найден или не содержит вопросов.",
      );
    }
    const existing = await repository.findCourseTemplate(command.courseId);
    const title = formatCourseSurveyTitle(reusable.title);

    return repository.transact(async (tx) => {
      const template = await tx.upsertCourseTemplate({
        courseId: command.courseId,
        existingId: existing?.id ?? null,
        fields: {
          title,
          description: reusable.description,
          introImageUrl: reusable.introImageUrl,
          isActive: true,
          isRequired: reusable.isRequired,
        },
      });

      await tx.replaceCourseQuestions(template.id, reusable.questions);

      const audit: SurveyAudit = {
        actorId: command.actor.id,
        actorLogin: command.actor.login,
        actorName: command.actor.name,
        action: "course_survey_template:apply",
        objectType: "course_survey_template",
        objectId: reusable.id,
        objectLabel: title,
        ipAddress: command.audit.ipAddress,
        userAgent: command.audit.userAgent,
        metadata: {
          courseId: command.courseId,
          targetSurveyTemplateId: template.id,
          hasIntroImage: Boolean(reusable.introImageUrl),
          questionsCount: reusable.questions.length,
        },
      };
      await tx.recordEffects({ audits: [audit] });

      return {
        templateId: template.id,
        reusableTitle: title,
        reusableTemplateId: reusable.id,
      };
    });
  };
}
