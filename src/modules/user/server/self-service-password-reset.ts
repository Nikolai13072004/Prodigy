import "server-only";

import bcrypt from "bcryptjs";
import {
  createRequestPasswordReset,
  createResetPasswordWithToken,
} from "../application/self-service-password-reset";
import { prismaSelfServicePasswordResetRepository } from "../infrastructure/prisma-self-service-password-reset-repository";

const repository = prismaSelfServicePasswordResetRepository;

export const requestPasswordReset = createRequestPasswordReset({ repository });
export const resetPasswordWithToken = createResetPasswordWithToken({
  repository,
  hashPassword: (password) => bcrypt.hash(password, 10),
});
