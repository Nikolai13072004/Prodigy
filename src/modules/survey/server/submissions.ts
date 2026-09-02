import "server-only";

import { createSubmitCourseItemSurvey } from "../application/submit-course-item-survey";
import { createSubmitCourseSurvey } from "../application/submit-course-survey";
import { prismaSurveySubmissionRepository } from "../infrastructure/prisma-survey-submission-repository";

const deps = { repository: prismaSurveySubmissionRepository };

export const submitCourseItemSurvey = createSubmitCourseItemSurvey(deps);
export const submitCourseSurvey = createSubmitCourseSurvey(deps);
