import "server-only";

import prisma from "@/lib/prisma";
import type {
  CreatedImportedUser,
  CreateImportedUserInput,
  UserImportRepository,
} from "../application/user-import-ports";

export const prismaUserImportRepository: UserImportRepository = {
  async loadReferenceData() {
    const [roleProfiles, groups, departments, organizations, existingUsers] = await Promise.all([
      prisma.roleProfile.findMany({
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.user.findMany({ select: { email: true, login: true } }),
    ]);
    return { roleProfiles, groups, departments, organizations, existingUsers };
  },

  async createImportedUsers(rows: CreateImportedUserInput[]) {
    return prisma.$transaction(async (tx) => {
      const created: CreatedImportedUser[] = [];

      for (const row of rows) {
        const user = await tx.user.create({
          data: {
            name: row.name,
            firstName: row.firstName,
            lastName: row.lastName,
            login: row.login,
            email: row.email,
            passwordHash: row.passwordHash,
            role: row.role,
            status: row.status,
            departmentId: row.departmentId,
            organizationId: row.organizationId,
            userRoles: {
              create: row.roleProfileIds.map((roleProfileId) => ({ roleProfileId })),
            },
            groupMemberships: row.groupId ? { create: { groupId: row.groupId } } : undefined,
          },
          select: { id: true, name: true, email: true, firstName: true, login: true },
        });

        if (row.activation && user.email) {
          await tx.userActivationInvite.create({
            data: {
              userId: user.id,
              email: user.email,
              tokenHash: row.activation.tokenHash,
              invitedById: row.activation.invitedById,
              expiresAt: row.activation.expiresAt,
            },
          });
        }

        created.push({
          id: user.id,
          name: user.name,
          email: user.email,
          firstName: user.firstName,
          login: user.login,
        });
      }

      return created;
    });
  },
};
