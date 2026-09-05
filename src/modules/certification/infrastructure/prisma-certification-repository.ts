import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform-settings";
import type { CertificateCourseItem } from "../domain/certificate-snapshot";
import type {
  CertificationRepository,
  CertificationTransaction,
  CompletionContext,
} from "../application/ports";

function createTransaction(
  client: Prisma.TransactionClient,
  scope: { courseId: string; userId: string }
): CertificationTransaction {
  const { courseId, userId } = scope;

  return {
    async findCertificate() {
      const found = await client.certificate.findFirst({
        where: { courseId, userId },
        select: {
          id: true,
          serial: true,
          courseId: true,
          userId: true,
          status: true,
          issuedAt: true,
          snapshotJson: true,
        },
      });
      return found ?? null;
    },

    async loadCompletionContext(): Promise<CompletionContext | null> {
      // Считаем по ЖИВЫМ items (archivedAt IS NULL), а не по publishedSnapshotJson (ADR-012).
      const course = await client.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          durationMinutes: true,
          category: true,
          statusFormat: true,
          ownerId: true,
          items: {
            where: { archivedAt: null },
            select: {
              id: true,
              type: true,
              title: true,
              isRequired: true,
              views: { where: { userId }, select: { progressPercent: true } },
              quiz: {
                select: {
                  maxAttempts: true,
                  minCorrectAnswers: true,
                  attempts: {
                    where: { userId },
                    select: {
                      outcome: true,
                      correctAnswers: true,
                      attemptNumber: true,
                      score: true,
                      maxScore: true,
                      completedAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!course) return null;

      const user = await client.user.findUnique({
        where: { id: userId },
        select: { name: true, firstName: true, lastName: true, login: true, email: true },
      });
      if (!user) return null;

      const [directAssignment, groupAssignment] = await Promise.all([
        client.courseUserAssignment.findFirst({ where: { courseId, userId }, select: { id: true } }),
        client.courseGroupAssignment.findFirst({
          where: { courseId, group: { memberships: { some: { userId } } } },
          select: { id: true },
        }),
      ]);

      const platform = await getPlatformSettings();

      const items: CertificateCourseItem[] = course.items.map((item) => ({
        id: item.id,
        type: item.type,
        isRequired: item.isRequired,
        title: item.title,
        materialProgress: item.views[0]?.progressPercent ?? 0,
        quiz: item.quiz
          ? {
              maxAttempts: item.quiz.maxAttempts,
              minCorrectAnswers: item.quiz.minCorrectAnswers,
              attempts: item.quiz.attempts,
            }
          : null,
      }));

      return {
        isAssignedLearner: Boolean(directAssignment) || Boolean(groupAssignment),
        completedAt: new Date(),
        learner: {
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          login: user.login,
          email: user.email,
        },
        course: {
          id: course.id,
          title: course.title,
          durationMinutes: course.durationMinutes,
          category: course.category,
          statusFormat: course.statusFormat,
          ownerId: course.ownerId,
        },
        items,
        platform: { siteName: platform.siteName, logoUrl: platform.logoUrl },
      };
    },

    async createCertificate(data) {
      const created = await client.certificate.create({
        data: {
          serial: data.serial,
          courseId: data.courseId,
          userId: data.userId,
          status: "ISSUED",
          issuedVia: data.issuedVia,
          issuedById: data.issuedById,
          completedAt: data.completedAt,
          snapshotJson: data.snapshotJson,
        },
        select: {
          id: true,
          serial: true,
          courseId: true,
          userId: true,
          status: true,
          issuedAt: true,
          snapshotJson: true,
        },
      });
      return created;
    },

    async recordEffects(effects) {
      if (effects.audit) {
        await client.auditLogEvent.create({
          data: {
            actorId: effects.audit.actorId,
            actorLogin: effects.audit.actorLogin,
            actorName: effects.audit.actorName,
            action: effects.audit.action,
            objectType: effects.audit.objectType,
            objectId: effects.audit.objectId,
            objectLabel: effects.audit.objectLabel,
            ipAddress: null,
            userAgent: null,
            metadataJson: JSON.stringify(effects.audit.metadata),
          },
        });
      }
      if (effects.outboxEvents.length > 0) {
        // Единственная (после enrollment) точка создания OutboxEvent в src/ —
        // сертификат и событие коммитятся одной транзакцией (ADR-005).
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

export const prismaCertificationRepository: CertificationRepository = {
  async transact({ courseId, userId, execute }) {
    return prisma.$transaction((client) => execute(createTransaction(client, { courseId, userId })));
  },
  isUniqueViolation(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  },
};
