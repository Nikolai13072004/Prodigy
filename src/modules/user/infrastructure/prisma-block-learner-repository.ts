import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";
import type {
  BlockLearnerRepository,
  BlockLearnerTransaction,
} from "../application/block-learner-as-hr-ports";

function createTransaction(client: Prisma.TransactionClient): BlockLearnerTransaction {
  return {
    async blockUser(userId) {
      await client.user.update({
        where: { id: userId },
        data: {
          status: USER_STATUSES.BLOCKED,
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });
    },
    async cancelPendingActivationInvites(userId) {
      await client.userActivationInvite.updateMany({
        where: { userId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    },
    async recordAudit(audit) {
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
          metadataJson: audit.metadata === undefined ? null : JSON.stringify(audit.metadata),
        },
      });
    },
  };
}

export const prismaBlockLearnerRepository: BlockLearnerRepository = {
  async findLearner(learnerId) {
    const learner = await prisma.user.findUnique({
      where: { id: learnerId },
      select: {
        id: true,
        name: true,
        login: true,
        email: true,
        role: true,
        status: true,
        userRoles: { select: { roleProfile: { select: { name: true } } } },
      },
    });
    if (!learner) return null;
    return {
      id: learner.id,
      name: learner.name,
      login: learner.login,
      email: learner.email,
      status: learner.status,
      role: learner.role,
      roleProfileNames: learner.userRoles.map((item) => item.roleProfile.name),
    };
  },

  async findRelatedCourseIds(learnerId) {
    const [directAssignments, groupAssignments] = await Promise.all([
      prisma.courseUserAssignment.findMany({
        where: { userId: learnerId },
        select: { courseId: true },
      }),
      prisma.courseGroupAssignment.findMany({
        where: { group: { memberships: { some: { userId: learnerId } } } },
        select: { courseId: true },
      }),
    ]);
    return [
      ...new Set([
        ...directAssignments.map((assignment) => assignment.courseId),
        ...groupAssignments.map((assignment) => assignment.courseId),
      ]),
    ];
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
