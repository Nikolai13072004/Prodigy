import "server-only";

import { createBlockLearnerAsHr } from "../application/block-learner-as-hr";
import { prismaBlockLearnerRepository } from "../infrastructure/prisma-block-learner-repository";

export const blockLearnerAsHr = createBlockLearnerAsHr({
  repository: prismaBlockLearnerRepository,
});
