import "server-only";

import prisma from "@/lib/prisma";
import { hashUserActivationToken } from "@/lib/user-activations";
import { USER_STATUSES } from "@/lib/users";
import type {
  ActivateAccountInput,
  UserActivationRepository,
} from "../application/activate-user-account-ports";

export const prismaUserActivationRepository: UserActivationRepository = {
  async findActivationByToken(token) {
    const invite = await prisma.userActivationInvite.findUnique({
      where: { tokenHash: hashUserActivationToken(token) },
      include: {
        user: {
          select: { id: true, name: true, login: true, email: true, status: true },
        },
      },
    });
    if (!invite) return null;
    return {
      id: invite.id,
      userId: invite.userId,
      status: invite.status,
      expiresAt: invite.expiresAt,
      user: {
        id: invite.user.id,
        name: invite.user.name,
        login: invite.user.login,
        email: invite.user.email,
        status: invite.user.status,
      },
    };
  },

  async markActivationExpired(id) {
    await prisma.userActivationInvite.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
  },

  async activateAccount(input: ActivateAccountInput) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.passwordHash,
          status: USER_STATUSES.ACTIVE,
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });

      await tx.userActivationInvite.update({
        where: { id: input.inviteId },
        data: { status: "ACCEPTED", activatedAt: new Date() },
      });
    });
  },
};
