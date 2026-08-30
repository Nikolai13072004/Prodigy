import "server-only";

import { randomBytes } from "crypto";
import { appBaseUrl } from "@/lib/app-base-url";
import { createIssueCertificateIfCompleted } from "../application/issue-certificate-if-completed";
import { prismaCertificationRepository } from "../infrastructure/prisma-certification-repository";

// Композиционный корень модуля certification: связывает use-case с Prisma-репозиторием,
// генератором серийника (неугадываемый hex, ADR-012) и абсолютным базовым URL.
export const issueCertificateIfCompleted = createIssueCertificateIfCompleted({
  repository: prismaCertificationRepository,
  generateSerial: () => randomBytes(16).toString("hex"),
  now: () => new Date(),
  baseUrl: appBaseUrl(),
});
