import "server-only";

import { createStartAssessmentAttempt } from "@/modules/assessment/application/start-assessment-attempt";
import { prismaAssessmentRepository } from "@/modules/assessment/infrastructure/prisma-assessment-repository";

export const startAssessmentAttempt = createStartAssessmentAttempt(prismaAssessmentRepository);
