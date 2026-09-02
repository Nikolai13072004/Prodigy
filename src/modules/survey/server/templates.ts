import "server-only";

import { createApplyReusableCourseItemSurveyTemplate } from "../application/apply-reusable-course-item-survey-template";
import { createApplyReusableCourseSurveyTemplate } from "../application/apply-reusable-course-survey-template";
import { createSaveCourseItemSurveyTemplate } from "../application/save-course-item-survey-template";
import { createSaveCourseSurveyTemplate } from "../application/save-course-survey-template";
import { prismaSurveyTemplateRepository } from "../infrastructure/prisma-survey-template-repository";

const deps = { repository: prismaSurveyTemplateRepository };

export const saveCourseSurveyTemplate = createSaveCourseSurveyTemplate(deps);
export const applyReusableCourseSurveyTemplate =
  createApplyReusableCourseSurveyTemplate(deps);
export const saveCourseItemSurveyTemplate =
  createSaveCourseItemSurveyTemplate(deps);
export const applyReusableCourseItemSurveyTemplate =
  createApplyReusableCourseItemSurveyTemplate(deps);
