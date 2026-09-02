import "server-only";

import bcrypt from "bcryptjs";
import { createResetUserPassword } from "../application/reset-user-password";
import { createSendUserInvite } from "../application/send-user-invite";
import { prismaUserCredentialsRepository } from "../infrastructure/prisma-user-credentials-repository";

const deps = {
  repository: prismaUserCredentialsRepository,
  hashPassword: (password: string) => bcrypt.hash(password, 10),
};

export const resetUserPassword = createResetUserPassword(deps);
export const sendUserInvite = createSendUserInvite(deps);
