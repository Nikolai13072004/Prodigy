import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  UserLifecycleRepository,
  UserLifecycleTransaction,
} from "../application/ports";

function createTransaction(
  client: Prisma.TransactionClient,
): UserLifecycleTransaction {
  return {
    async findUsersByIds(userIds) {
      if (userIds.length === 0) return [];
      const rows = await client.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          login: true,
          email: true,
          name: true,
          status: true,
        },
      });
      return rows;
    },

    async changeUserStatuses(userIds, nextStatus) {
      if (userIds.length === 0) return;
      await client.user.updateMany({
        where: { id: { in: userIds } },
        data: {
          status: nextStatus,
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });
    },

    async cancelPendingInvites(userIds) {
      if (userIds.length === 0) return;
      await client.userActivationInvite.updateMany({
        where: { userId: { in: userIds }, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    },

    async deleteUserEmailJobsByEmail(email) {
      // Незавершённая рассылка на этот адрес больше не имеет смысла — иначе
      // воркер попытается отправить письмо уже несуществующему пользователю.
      // DEAD/PROCESSED оставляем как исторический след.
      await client.emailJob.deleteMany({
        where: {
          toEmail: email,
          status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        },
      });
    },

    async deleteCourseInvitesByEmail(email) {
      await client.courseInvite.deleteMany({
        where: { email },
      });
    },

    async deleteCourseInvitesByAcceptedUserId(userId) {
      await client.courseInvite.deleteMany({
        where: { acceptedUserId: userId },
      });
    },

    async hardDeleteUser(userId) {
      await client.user.delete({ where: { id: userId } });
    },

    async recordEffects(effects) {
      if (effects.audit) {
        // Аудит пишется тем же tx-клиентом, что и мутация (ADR-005):
        // «мутация есть — записи в аудите нет» невозможно.
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
      }
    },
  };
}

export const prismaUserLifecycleRepository: UserLifecycleRepository = {
  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
