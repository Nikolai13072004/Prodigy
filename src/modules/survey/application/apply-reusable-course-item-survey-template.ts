import { formatCourseSurveyTitle } from "@/lib/course-surveys";
import { SurveyApplicationError } from "./errors";
import type {
  SurveyAudit,
  SurveyTemplateRepository,
} from "./survey-template-ports";

// Use-case: применить reusable к template опроса-ITEM (в структуре курса).
// В отличие от course-level, ещё обновляет сам courseItem (title/isRequired
// из reusable, обнуляет artefacts прочих типов) и помечает курс изменённым.

export type ApplyReusableCourseItemSurveyCommand = {
  courseId: string;
  itemId: string;
  reusableTemplateId: string;
  actor: { id: string; login: string | null; name: string | null };
  audit: { ipAddress: string | null; userAgent: string | null };
};

export type ApplyReusableCourseItemSurveyResult = {
  templateId: string;
  reusableTitle: string;
  reusableTemplateId: string;
};

export type ApplyReusableCourseItemSurveyDeps = {
  repository: SurveyTemplateRepository;
};

export function createApplyReusableCourseItemSurveyTemplate(
  deps: ApplyReusableCourseItemSurveyDeps,
) {
  const { repository } = deps;

  return async function applyReusableCourseItemSurveyTemplate(
    command: ApplyReusableCourseItemSurveyCommand,
  ): Promise<ApplyReusableCourseItemSurveyResult> {
    if (!command.reusableTemplateId) {
      throw new SurveyApplicationError(
        "VALIDATION_FAILED",
        "Выберите шаблон опроса.",
      );
    }

    const [item, reusable, existing] = await Promise.all([
      repository.findItem(command.courseId, command.itemId),
      repository.findReusableTemplate(command.reusableTemplateId),
      repository.findItemTemplate(command.itemId),
    ]);
    if (!item || item.type !== "SURVEY") {
      throw new SurveyApplicationError("ITEM_NOT_SURVEY", "Опрос не найден.");
    }
    if (!reusable || reusable.questions.length === 0) {
      throw new SurveyApplicationError(
        "REUSABLE_NOT_FOUND",
        "Шаблон опроса не найден или не содержит вопросов.",
      );
    }

    const title = formatCourseSurveyTitle(reusable.title);

    return repository.transact(async (tx) => {
      await tx.updateCourseItem(command.itemId, {
        title,
        isRequired: reusable.isRequired,
      });

      const template = await tx.upsertItemTemplate({
        courseId: command.courseId,
        courseItemId: command.itemId,
        existingId: existing?.id ?? null,
        fields: {
          title,
          description: reusable.description,
          introImageUrl: reusable.introImageUrl,
          isActive: true,
          isRequired: reusable.isRequired,
        },
      });

      await tx.replaceItemQuestions(template.id, reusable.questions);
      await tx.markCourseContentChangedIfPublished(command.courseId);

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
          courseItemId: command.itemId,
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
