import "server-only";

import { createSaveAssessmentDraft } from "@/modules/assessment/application/save-assessment-draft";
import { prismaAssessmentRepository } from "@/modules/assessment/infrastructure/prisma-assessment-repository";

export const saveAssessmentDraft = createSaveAssessmentDraft(prismaAssessmentRepository);
