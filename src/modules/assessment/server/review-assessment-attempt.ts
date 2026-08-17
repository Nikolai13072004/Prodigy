import "server-only";

import { createReviewAssessmentAttempt } from "@/modules/assessment/application/review-assessment-attempt";
import { prismaAssessmentReviewRepository } from "@/modules/assessment/infrastructure/prisma-assessment-review-repository";

export const reviewAssessmentAttempt = createReviewAssessmentAttempt(
  prismaAssessmentReviewRepository,
);
