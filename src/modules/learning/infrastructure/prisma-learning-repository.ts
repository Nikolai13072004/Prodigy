import "server-only";

import prisma from "@/lib/prisma";
import type { LearningRepository, StoredMaterialProjection } from "@/modules/learning/application/ports";

function parseViewedPages(raw: string): number[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? value.filter((page): page is number => typeof page === "number" && Number.isInteger(page))
      : [];
  } catch {
    return [];
  }
}

export const prismaLearningRepository: LearningRepository = {
  findMaterial(materialId) {
    return prisma.courseItem.findFirst({
      where: { id: materialId, archivedAt: null },
      select: { id: true, courseId: true, type: true, totalSlides: true, isRequired: true },
    });
  },

  async saveEventAndProject({ material, userId, event, project }) {
    return prisma.$transaction(async (transaction) => {
      const view = await transaction.courseItemView.findUnique({
        where: { courseItemId_userId: { courseItemId: material.id, userId } },
        select: {
          progressPercent: true,
          maxPageSeen: true,
          totalPages: true,
          viewedPagesJson: true,
        },
      });
      const previous: StoredMaterialProjection = view
        ? {
            progressPercent: view.progressPercent,
            maxPageSeen: view.maxPageSeen,
            totalPages: view.totalPages,
            viewedPages: parseViewedPages(view.viewedPagesJson),
          }
        : null;
      const projection = project(previous);

      await transaction.learningEvent.create({
        data: {
          courseItemId: material.id,
          userId,
          type: event.type,
          payloadJson: JSON.stringify(event),
        },
      });
      await transaction.courseItemView.upsert({
        where: { courseItemId_userId: { courseItemId: material.id, userId } },
        create: {
          courseItemId: material.id,
          userId,
          progressPercent: projection.progressPercent,
          maxPageSeen: projection.maxPageSeen,
          totalPages: projection.totalPages,
          viewedPagesJson: JSON.stringify(projection.viewedPages),
          viewedAt: new Date(),
        },
        update: {
          progressPercent: projection.progressPercent,
          maxPageSeen: projection.maxPageSeen,
          totalPages: projection.totalPages,
          viewedPagesJson: JSON.stringify(projection.viewedPages),
          viewedAt: new Date(),
        },
      });
      return { projection, previousProgressPercent: previous?.progressPercent ?? null };
    });
  },
};
