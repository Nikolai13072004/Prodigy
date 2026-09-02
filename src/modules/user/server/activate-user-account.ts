import "server-only";

import bcrypt from "bcryptjs";
import { createActivateUserAccount } from "../application/activate-user-account";
import { prismaUserActivationRepository } from "../infrastructure/prisma-user-activation-repository";

export const activateUserAccount = createActivateUserAccount({
  repository: prismaUserActivationRepository,
  hashPassword: (password) => bcrypt.hash(password, 10),
});
