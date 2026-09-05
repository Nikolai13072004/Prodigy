import "server-only";

import { createManageOrgEntity } from "../application/manage-org-entity";
import { prismaOrganizationRepository } from "../infrastructure/prisma-organization-repository";

export const organizations = createManageOrgEntity({
  repository: prismaOrganizationRepository,
  kind: {
    objectType: "organization",
    auditPrefix: "organizations",
    requiredMessage: "Название организации обязательно",
    notFoundMessage: "Организация не найдена",
    takenMessage: "Организация с таким названием уже существует",
  },
});
