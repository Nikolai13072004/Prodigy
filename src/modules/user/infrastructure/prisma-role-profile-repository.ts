import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  RoleProfileRepository,
  RoleProfileTransaction,
} from "../application/role-profile-ports";

function createTransaction(
  client: Prisma.TransactionClient,
): RoleProfileTransaction {
  return {
    async createRole(data) {
      const created = await client.roleProfile.create({
        data: {
          name: data.name,
          permissionsJson: data.permissionsJson,
          isSystem: false,
        },
        select: { id: true, name: true },
      });
      return created;
    },

    async updateRole(input) {
      await client.roleProfile.update({
        where: { id: input.roleId },
        data: {
          name: input.name,
          permissionsJson: input.permissionsJson,
        },
      });
    },

    async renameUsersRole(fromName, toName) {
      await client.user.updateMany({
        where: { role: fromName },
        data: { role: toName },
      });
    },

    async deleteRole(roleId) {
      await client.roleProfile.delete({ where: { id: roleId } });
    },

    async setUserRole(input) {
      await client.user.update({
        where: { id: input.userId },
        data: { role: input.primaryRoleName },
      });
      await client.userRole.deleteMany({ where: { userId: input.userId } });
      if (input.roleProfileIds.length > 0) {
        await client.userRole.createMany({
          data: input.roleProfileIds.map((roleProfileId) => ({
            userId: input.userId,
            roleProfileId,
          })),
        });
      }
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

export const prismaRoleProfileRepository: RoleProfileRepository = {
  async findRoleById(roleId) {
    const role = await prisma.roleProfile.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, isSystem: true, permissionsJson: true },
    });
    return role;
  },

  async loadRoleProfilesByNames(names) {
    if (names.length === 0) return [];
    const rows = await prisma.roleProfile.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    return rows;
  },

  async countUsersWithRole(roleId, roleName) {
    return prisma.user.count({
      where: {
        OR: [
          { role: roleName },
          { userRoles: { some: { roleProfileId: roleId } } },
        ],
      },
    });
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
