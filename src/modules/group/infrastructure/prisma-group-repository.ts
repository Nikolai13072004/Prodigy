import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { STANDARD_ROLE_NAMES } from "@/lib/roles";
import { USER_STATUSES } from "@/lib/users";
import type {
  GroupRepository,
  GroupTransaction,
} from "../application/ports";

function createTransaction(
  client: Prisma.TransactionClient,
): GroupTransaction {
  return {
    async createGroup(name, description) {
      return client.group.create({
        data: { name, description },
        select: { id: true, name: true },
      });
    },
    async updateGroup(id, name, description) {
      await client.group.update({ where: { id }, data: { name, description } });
    },
    async replaceMemberships(groupId, userIds) {
      await client.groupMembership.deleteMany({ where: { groupId } });
      if (userIds.length > 0) {
        await client.groupMembership.createMany({
          data: userIds.map((userId) => ({ groupId, userId })),
        });
      }
    },
    async recordEffects({ audit }) {
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
            audit.metadata === undefined ? null : JSON.stringify(audit.metadata),
        },
      });
    },
  };
}

export const prismaGroupRepository: GroupRepository = {
  async findCard(id) {
    return prisma.group.findUnique({
      where: { id },
      select: { id: true, name: true, description: true },
    });
  },

  async findMembershipContext(id) {
    const group = await prisma.group.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        memberships: { select: { userId: true } },
        courseAssignments: { select: { courseId: true } },
      },
    });
    if (!group) return null;
    return {
      id: group.id,
      name: group.name,
      memberUserIds: group.memberships.map((membership) => membership.userId),
      courseIds: group.courseAssignments.map((assignment) => assignment.courseId),
    };
  },

  async filterEligibleStudentIds(userIds) {
    if (userIds.length === 0) return [];
    const rows = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        status: { notIn: [USER_STATUSES.BLOCKED, USER_STATUSES.ARCHIVED] },
        OR: [
          { role: STANDARD_ROLE_NAMES.STUDENT },
          {
            userRoles: {
              some: { roleProfile: { name: STANDARD_ROLE_NAMES.STUDENT } },
            },
          },
        ],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },

  isUniqueViolation(error) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  },
};
