import "server-only";

import prisma from "@/lib/prisma";
import type { UserTotpRepository } from "../application/complete-admin-totp-setup";

export const prismaUserTotpRepository: UserTotpRepository = {
  async upsertTotpCredential(input) {
    await prisma.userTotpCredential.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        secretCiphertext: input.secretCiphertext,
        recoveryCodesJson: input.recoveryCodesJson,
      },
      update: {
        secretCiphertext: input.secretCiphertext,
        recoveryCodesJson: input.recoveryCodesJson,
      },
    });
  },
};
