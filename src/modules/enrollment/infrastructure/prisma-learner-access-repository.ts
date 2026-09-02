import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isUserAssignedToCourse } from "@/lib/access";
import type {
  LearnerAccessExpiries,
  LearnerAccessRepository,
  LearnerAccessTransaction,
} from "../application/learner-access-ports";

function createTransaction(
  client: Prisma.TransactionClient,
): LearnerAccessTransaction {
  return {
    async upsertLearnerAssignments(courseId, actorId, inputs) {
      // Prisma не даёт upsertMany — гоним по одному в общем tx.
      // Все апдейты фиксируют актора и новый срок; assignedAt при этом остаётся
      // исходным (устанавливается на create только у новых назначений).
      for (const input of inputs) {
        await client.courseUserAssignment.upsert({
          where: {
            courseId_userId: {
              courseId,
              userId: input.learnerId,
            },
          },
          create: {
            courseId,
            userId: input.learnerId,
            assignedById: actorId,
            expiresAt: input.expiresAt,
          },
          update: {
            assignedById: actorId,
            expiresAt: input.expiresAt,
          },
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

export const prismaLearnerAccessRepository: LearnerAccessRepository = {
  async loadCourseHead(courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true },
    });
    return course;
  },

  async loadLearners(learnerIds) {
    if (learnerIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: learnerIds } },
      select: {
        id: true,
        name: true,
        email: true,
        firstName: true,
        status: true,
      },
    });
    return users;
  },

  async hasActiveAssignment(courseId, userId) {
    return isUserAssignedToCourse(userId, courseId);
  },

  async loadLearnerAccessExpiries(courseId, learnerIds) {
    const result = new Map<string, LearnerAccessExpiries>();
    if (learnerIds.length === 0) return result;
    for (const id of learnerIds) {
      result.set(id, { direct: [], group: [] });
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        directAssignments: {
          where: { userId: { in: learnerIds } },
          select: { userId: true, expiresAt: true },
        },
        groupAssignments: {
          select: {
            expiresAt: true,
            group: {
              select: {
                memberships: {
                  where: { userId: { in: learnerIds } },
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!course) return result;

    for (const assignment of course.directAssignments) {
      const entry = result.get(assignment.userId);
      if (entry) entry.direct.push(assignment.expiresAt);
    }
    for (const assignment of course.groupAssignments) {
      for (const membership of assignment.group.memberships) {
        const entry = result.get(membership.userId);
        if (entry) entry.group.push(assignment.expiresAt);
      }
    }
    return result;
  },

  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
};
