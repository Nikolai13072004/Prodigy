import "server-only";

import { issueCertificateIfCompleted } from "@/modules/certification/server/issue-certificate-if-completed";
import { createRecordMaterialLearningEvent } from "@/modules/learning/application/record-material-learning-event";
import { learningAccessPolicy } from "@/modules/learning/infrastructure/learning-access-policy";
import { prismaLearningRepository } from "@/modules/learning/infrastructure/prisma-learning-repository";

export const recordMaterialLearningEvent = createRecordMaterialLearningEvent({
  repository: prismaLearningRepository,
  accessPolicy: learningAccessPolicy,
  // Здесь и только здесь learning узнаёт про certification (ADR-012).
  onCourseProgressAdvanced: async ({ userId, courseId }) => {
    await issueCertificateIfCompleted({ userId, courseId, issuedVia: "LEARNING" });
  },
});
