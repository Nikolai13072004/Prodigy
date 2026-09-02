import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  CurrentUserProfile,
  UserProfileRepository,
  UserProfileTransaction,
} from "../application/user-profile-ports";

function toCurrentUserProfile(
  user: {
    id: string;
    name: string;
    firstName: string;
    lastName: string | null;
    login: string;
    email: string | null;
    avatarUrl: string | null;
    role: string;
    status: string;
    departmentId: string | null;
    organizationId: string | null;
    groupMemberships: Array<{ groupId: string }>;
    userRoles: Array<{ roleProfile: { name: string } }>;
  } | null,
): CurrentUserProfile | null {
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
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    login: user.login,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    departmentId: user.departmentId,
    organizationId: user.organizationId,
    roleNames,
    groupIds: user.groupMemberships.map((membership) => membership.groupId),
  };
}

function createTransaction(
  client: Prisma.TransactionClient,
): UserProfileTransaction {
  return {
    async applyUpdate(input) {
      const { userId, scalar, passwordHash, roleProfileIds, groupId } = input;

      await client.user.update({
        where: { id: userId },
        data: {
          ...scalar,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });

      if (passwordHash) {
        // Смена пароля обесценивает уже отправленные ссылки восстановления —
        // отменяем их в той же транзакции, чтобы старый токен не сработал.
        await client.passwordResetToken.updateMany({
          where: { userId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
      }

      await client.userRole.deleteMany({ where: { userId } });
      if (roleProfileIds.length > 0) {
        await client.userRole.createMany({
          data: roleProfileIds.map((roleProfileId) => ({
            userId,
            roleProfileId,
          })),
        });
      }

      await client.groupMembership.deleteMany({ where: { userId } });
      if (groupId) {
        await client.groupMembership.create({
          data: { userId, groupId },
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

export const prismaUserProfileRepository: UserProfileRepository = {
  async loadCurrentUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        login: true,
        email: true,
        avatarUrl: true,
        role: true,
        status: true,
        departmentId: true,
        organizationId: true,
        groupMemberships: { select: { groupId: true } },
        userRoles: {
          include: { roleProfile: { select: { name: true } } },
        },
      },
    });
    return toCurrentUserProfile(user);
  },

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
