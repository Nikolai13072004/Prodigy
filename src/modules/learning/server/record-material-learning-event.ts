import "server-only";

import { createRecordMaterialLearningEvent } from "@/modules/learning/application/record-material-learning-event";
import { learningAccessPolicy } from "@/modules/learning/infrastructure/learning-access-policy";
import { prismaLearningRepository } from "@/modules/learning/infrastructure/prisma-learning-repository";

export const recordMaterialLearningEvent = createRecordMaterialLearningEvent({
  repository: prismaLearningRepository,
  accessPolicy: learningAccessPolicy,
});
