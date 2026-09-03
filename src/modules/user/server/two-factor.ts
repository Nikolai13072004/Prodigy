import "server-only";

import {
  encryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyTotpCode,
} from "@/lib/two-factor";
import { createCompleteAdminTotpSetup } from "../application/complete-admin-totp-setup";
import { prismaUserTotpRepository } from "../infrastructure/prisma-user-totp-repository";

export const adminTotpSetup = createCompleteAdminTotpSetup({
  repository: prismaUserTotpRepository,
  verifyTotpCode,
  generateRecoveryCodes,
  encryptTotpSecret,
  hashRecoveryCode,
});
