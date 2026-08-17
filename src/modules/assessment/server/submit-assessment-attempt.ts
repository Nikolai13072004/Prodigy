import "server-only";

import { createSubmitAssessmentAttempt } from "@/modules/assessment/application/submit-assessment-attempt";
import { prismaAssessmentRepository } from "@/modules/assessment/infrastructure/prisma-assessment-repository";

export const submitAssessmentAttempt = createSubmitAssessmentAttempt(prismaAssessmentRepository);
