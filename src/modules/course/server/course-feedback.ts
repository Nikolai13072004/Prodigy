import "server-only";

import { createManageCourseFeedback } from "../application/manage-course-feedback";
import { prismaCourseFeedbackRepository } from "../infrastructure/prisma-course-feedback-repository";

export const courseFeedback = createManageCourseFeedback({
  repository: prismaCourseFeedbackRepository,
});
