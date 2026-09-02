import "server-only";

import prisma from "@/lib/prisma";
import { hashPasswordResetToken } from "@/lib/password-resets";
import { USER_STATUSES } from "@/lib/users";
import type {
  ApplyPasswordResetInput,
  IssueResetTokenInput,
  SelfServicePasswordResetRepository,
} from "../application/self-service-password-reset-ports";

export const prismaSelfServicePasswordResetRepository: SelfServicePasswordResetRepository = {
  async findUserByIdentifiers(variants) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ login: { in: variants } }, { email: { in: variants } }],
      },
      select: {
        id: true,
        email: true,
        login: true,
        name: true,
        firstName: true,
        status: true,
      },
    });
    return user ?? null;
  },

  async issueResetToken(input: IssueResetTokenInput) {
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: input.userId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: input.userId,
          email: input.email,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });
    });
  },

  async findResetByToken(token) {
    const reset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashPasswordResetToken(token) },
      include: {
        user: {
          select: { id: true, name: true, login: true, email: true, status: true },
        },
      },
    });
    if (!reset) return null;
    return {
      id: reset.id,
      userId: reset.userId,
      status: reset.status,
      expiresAt: reset.expiresAt,
      user: {
        id: reset.user.id,
        name: reset.user.name,
        login: reset.user.login,
        email: reset.user.email,
        status: reset.user.status,
      },
    };
  },

  async markResetExpired(id) {
    await prisma.passwordResetToken.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
  },

  async applyPasswordReset(input: ApplyPasswordResetInput) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.passwordHash,
          failedLoginAttempts: 0,
          loginLockedUntil: null,
          status:
            input.currentStatus === USER_STATUSES.PENDING
              ? USER_STATUSES.ACTIVE
              : input.currentStatus,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: input.tokenId },
        data: { status: "USED", usedAt: new Date() },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: input.userId,
          status: "PENDING",
          NOT: { id: input.tokenId },
        },
        data: { status: "CANCELLED" },
      });
    });
  },
};
