import "server-only";

import { createManageOrgEntity } from "../application/manage-org-entity";
import { prismaDepartmentRepository } from "../infrastructure/prisma-department-repository";

export const departments = createManageOrgEntity({
  repository: prismaDepartmentRepository,
  kind: {
    objectType: "department",
    auditPrefix: "departments",
    requiredMessage: "Название подразделения обязательно",
    notFoundMessage: "Подразделение не найдено",
    takenMessage: "Подразделение с таким названием уже существует",
  },
});
