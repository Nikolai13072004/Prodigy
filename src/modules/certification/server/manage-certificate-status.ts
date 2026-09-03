import "server-only";

import { createManageCertificateStatus } from "../application/manage-certificate-status";
import { prismaCertificateStatusRepository } from "../infrastructure/prisma-certificate-status-repository";

export const certificateStatus = createManageCertificateStatus({
  repository: prismaCertificateStatusRepository,
});
