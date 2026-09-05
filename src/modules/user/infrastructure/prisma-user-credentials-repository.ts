import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  UserCredentialsRepository,
  UserCredentialsTransaction,
} from "../application/user-credentials-ports";

function createTransaction(
  client: Prisma.TransactionClient,
): UserCredentialsTransaction {
  return {
    async resetPasswordAndCancelResetTokens(userId, passwordHash) {
      await client.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });
      // Уже отправленные ссылки восстановления теряют смысл — новый пароль их
      // делает лишним каналом входа, отменяем в той же транзакции.
      await client.passwordResetToken.updateMany({
        where: { userId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    },

    async recordEffects(effects) {
      if (!effects.audit) return;
      const audit = effects.audit;
      await client.auditLogEvent.create({
        data: {
          actorId: audit.actorId,
          actorLogin: audit.actorLogin,
          actorName: audit.actorName,
          action: audit.action,
          objectType: audit.objectType,
          objectId: audit.objectId,
          objectLabel: audit.objectLabel,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
          metadataJson:
            audit.metadata === undefined
              ? null
              : JSON.stringify(audit.metadata),
        },
      });
    },
  };
}

export const prismaUserCredentialsRepository: UserCredentialsRepository = {
  async findUserForPasswordReset(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        login: true,
        name: true,
        firstName: true,
      },
    });
    return user;
  },

  async findUserForInvite(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        login: true,
        name: true,
        role: true,
        firstName: true,
        status: true,
        userRoles: {
          select: { roleProfile: { select: { name: true } } },
        },
      },
    });
    if (!user) return null;
    const roleNames = [
      ...new Set(
        [
          ...user.userRoles.map((membership) => membership.roleProfile.name),
          user.role,
        ].filter(Boolean),
      ),
    ];
    return {
      id: user.id,
      login: user.login,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      status: user.status,
      roleNames,
    };
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
