import "server-only";

import prisma from "@/lib/prisma";
import type { EnrollmentAccessRepository } from "@/modules/enrollment/application/ports";

export const prismaEnrollmentAccessRepository: EnrollmentAccessRepository = {
  async findAssignments(courseId, userId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        directAssignments: {
          where: { userId },
          select: { expiresAt: true },
        },
        groupAssignments: {
          where: {
            group: {
              memberships: { some: { userId } },
            },
          },
          select: { expiresAt: true },
        },
      },
    });
    return {
      directExpiries: course?.directAssignments.map((assignment) => assignment.expiresAt) ?? [],
      groupExpiries: course?.groupAssignments.map((assignment) => assignment.expiresAt) ?? [],
    };
  },
};
