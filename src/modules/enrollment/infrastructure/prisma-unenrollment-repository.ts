import "server-only";

import prisma from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit-log";
import type { UnenrollmentRepository } from "../application/unenroll-ports";

export const prismaUnenrollmentRepository: UnenrollmentRepository = {
  async loadContext(courseId, learnerId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        items: { select: { id: true, quiz: { select: { id: true } } } },
        directAssignments: { where: { userId: learnerId }, select: { userId: true } },
        groupAssignments: {
          select: {
            group: {
              select: {
                memberships: { where: { userId: learnerId }, select: { userId: true } },
              },
            },
          },
        },
      },
    });
    if (!course) return null;

    const relevantGroups = course.groupAssignments.filter(
      (assignment) => assignment.group.memberships.length > 0
    );

    return {
      courseTitle: course.title,
      courseItemIds: course.items.map((item) => item.id),
      courseQuizIds: course.items.flatMap((item) => (item.quiz?.id ? [item.quiz.id] : [])),
      hadDirectAssignment: course.directAssignments.length > 0,
      hadGroupAssignment: relevantGroups.length > 0,
    };
  },

  async applyUnenrollment(write) {
    await prisma.$transaction(async (tx) => {
      if (write.assignmentAction === "OVERRIDE_EXPIRE") {
        await tx.courseUserAssignment.upsert({
          where: { courseId_userId: { courseId: write.courseId, userId: write.learnerId } },
          create: {
            courseId: write.courseId,
            userId: write.learnerId,
            assignedById: write.actorId,
            expiresAt: write.overrideExpiresAt,
          },
          update: { assignedById: write.actorId, expiresAt: write.overrideExpiresAt },
        });
      } else {
        await tx.courseUserAssignment.deleteMany({
          where: { courseId: write.courseId, userId: write.learnerId },
        });
      }

      if (!write.deleteProgress) return;

      if (write.courseItemIds.length > 0) {
        await tx.courseItemView.deleteMany({
          where: { userId: write.learnerId, courseItemId: { in: write.courseItemIds } },
        });
      }

      if (write.courseQuizIds.length > 0) {
        await tx.quizUserBestResult.deleteMany({
          where: { userId: write.learnerId, quizId: { in: write.courseQuizIds } },
        });
        await tx.quizAttempt.deleteMany({
          where: { userId: write.learnerId, quizId: { in: write.courseQuizIds } },
        });
      }

      await tx.courseFeedback.deleteMany({
        where: { courseId: write.courseId, userId: write.learnerId },
      });
    });
  },

  async revokeIssuedCertificate({ courseId, learnerId, actorId, now }) {
    const revoked = await prisma.certificate.updateMany({
      where: { courseId, userId: learnerId, status: "ISSUED" },
      data: { status: "REVOKED", revokedAt: now, revokedById: actorId, revokeReason: "Отчисление с курса" },
    });
    return revoked.count > 0;
  },

  async recordAudit(audit) {
    await recordAuditEvent({
      actor: audit.actor,
      action: "courses:unenroll_learner",
      objectType: "course_assignment",
      objectId: `${audit.courseId}:${audit.learnerId}`,
      objectLabel: audit.objectLabel,
      metadata: {
        courseId: audit.courseId,
        learnerId: audit.learnerId,
        hadDirectAssignment: audit.hadDirectAssignment,
        hadGroupAssignment: audit.hadGroupAssignment,
        progressDisposition: audit.deleteProgress ? "delete" : "keep",
        certificateRevoked: audit.certificateRevoked,
        overrideExpiresAt: audit.overrideExpiresAt ? audit.overrideExpiresAt.toISOString() : null,
      },
    });
  },
};
