import "server-only";

import { createManageGroups } from "../application/manage-groups";
import { prismaGroupRepository } from "../infrastructure/prisma-group-repository";

export const groups = createManageGroups({ repository: prismaGroupRepository });
