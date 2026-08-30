import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  EnrollmentMutationRepository,
  EnrollmentMutationTransaction,
  EnrollmentRecipient,
} from "../application/mutation-ports";

function createTransaction(client: Prisma.TransactionClient): EnrollmentMutationTransaction {
  return {
    async loadState(courseId) {
      const course = await client.course.findUnique({
        where: { id: courseId },
        select: {
          title: true,
          status: true,
          directAssignments: { select: { userId: true } },
          groupAssignments: {
            select: {
              groupId: true,
              group: {
                select: {
                  memberships: { select: { userId: true } },
                },
              },
            },
          },
        },
      });
      if (!course) return null;
      return {
        course: { title: course.title, status: course.status },
        directUserIds: course.directAssignments.map((assignment) => assignment.userId),
        groupIds: course.groupAssignments.map((assignment) => assignment.groupId),
        inheritedUserIds: course.groupAssignments.flatMap((assignment) =>
          assignment.group.memberships.map((membership) => membership.userId)
        ),
      };
    },

    async replaceState(args) {
      await client.courseUserAssignment.deleteMany({ where: { courseId: args.courseId } });
      await client.courseGroupAssignment.deleteMany({ where: { courseId: args.courseId } });
      if (args.pendingInviteDelete === "ALL") {
        await client.courseInvite.deleteMany({
          where: { courseId: args.courseId, status: "PENDING" },
        });
      } else if (args.pendingInviteDelete.length > 0) {
        await client.courseInvite.deleteMany({
          where: {
            courseId: args.courseId,
            status: "PENDING",
            email: { in: args.pendingInviteDelete },
          },
        });
      }
      if (args.directUserIds.length > 0) {
        await client.courseUserAssignment.createMany({
          data: args.directUserIds.map((userId) => ({
            courseId: args.courseId,
            userId,
            assignedById: args.actorId,
            expiresAt: args.accessExpiresAt,
          })),
        });
      }
      if (args.groupIds.length > 0) {
        await client.courseGroupAssignment.createMany({
          data: args.groupIds.map((groupId) => ({
            courseId: args.courseId,
            groupId,
            assignedById: args.actorId,
            expiresAt: args.accessExpiresAt,
          })),
        });
      }
      if (args.pendingInvites.length > 0) {
        await client.courseInvite.createMany({
          data: args.pendingInvites.map((invite) => ({
            courseId: args.courseId,
            invitedById: args.actorId,
            ...invite,
          })),
        });
      }
    },

    async findActiveRecipients(directUserIds, groupIds) {
      const [directUsers, groupMemberships] = await Promise.all([
        directUserIds.length > 0
          ? client.user.findMany({
              where: { id: { in: directUserIds }, status: "ACTIVE", email: { not: null } },
              select: { id: true, email: true, name: true, firstName: true },
            })
          : Promise.resolve([]),
        groupIds.length > 0
          ? client.groupMembership.findMany({
              where: {
                groupId: { in: groupIds },
                user: { status: "ACTIVE", email: { not: null } },
              },
              select: {
                user: { select: { id: true, email: true, name: true, firstName: true } },
              },
            })
          : Promise.resolve([]),
      ]);
      const recipients = new Map<string, EnrollmentRecipient>();
      for (const user of directUsers) {
        if (!user.email) continue;
        recipients.set(user.id, { userId: user.id, email: user.email, name: user.name, firstName: user.firstName });
      }
      for (const membership of groupMemberships) {
        const user = membership.user;
        if (!user.email) continue;
        recipients.set(user.id, { userId: user.id, email: user.email, name: user.name, firstName: user.firstName });
      }
      return [...recipients.values()];
    },

    async recordEffects(effects) {
      await client.auditLogEvent.create({
        data: {
          actorId: effects.audit.actorId,
          actorLogin: effects.audit.actorLogin,
          actorName: effects.audit.actorName,
          action: effects.audit.action,
          objectType: effects.audit.objectType,
          objectId: effects.audit.objectId,
          objectLabel: effects.audit.objectLabel,
          ipAddress: effects.audit.ipAddress,
          userAgent: effects.audit.userAgent,
          metadataJson: JSON.stringify(effects.audit.metadata),
        },
      });
      if (effects.outboxEvents.length > 0) {
        await client.outboxEvent.createMany({
          data: effects.outboxEvents.map((event) => ({
            topic: event.topic,
            payloadJson: JSON.stringify(event.payload),
          })),
        });
      }
    },
  };
}

export const prismaEnrollmentMutationRepository: EnrollmentMutationRepository = {
  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
