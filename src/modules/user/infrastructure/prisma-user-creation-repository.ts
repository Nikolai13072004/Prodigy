import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  UserCreationRepository,
  UserCreationTransaction,
} from "../application/user-creation-ports";

function createTransaction(
  client: Prisma.TransactionClient,
): UserCreationTransaction {
  return {
    async createUser(input) {
      const user = await client.user.create({
        data: {
          name: input.name,
          firstName: input.firstName,
          lastName: input.lastName,
          login: input.login,
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role,
          status: input.status,
          departmentId: input.departmentId,
          organizationId: input.organizationId,
          userRoles: {
            create: input.roleProfileIds.map((roleProfileId) => ({
              roleProfileId,
            })),
          },
          groupMemberships: input.groupId
            ? { create: { groupId: input.groupId } }
            : undefined,
        },
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

    async createActivationInvite(input) {
      await client.userActivationInvite.create({
        data: {
          userId: input.userId,
          email: input.email,
          tokenHash: input.tokenHash,
          invitedById: input.invitedById,
          expiresAt: input.expiresAt,
        },
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

export const prismaUserCreationRepository: UserCreationRepository = {
  async loadRoleProfilesByNames(names) {
    if (names.length === 0) return [];
    const rows = await prisma.roleProfile.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    return rows;
  },

  async checkGroupExists(groupId) {
    const row = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    return Boolean(row);
  },

  async checkDepartmentExists(departmentId) {
    const row = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    return Boolean(row);
  },

  async checkOrganizationExists(organizationId) {
    const row = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    return Boolean(row);
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
