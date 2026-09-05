import "server-only";

import prisma from "@/lib/prisma";
import type {
  AdminCoursesView,
  UserUiPreferenceRepository,
} from "../application/manage-ui-preferences";

export const prismaUiPreferenceRepository: UserUiPreferenceRepository = {
  async upsertAdminCoursesView(userId: string, view: AdminCoursesView) {
    await prisma.userUiPreference.upsert({
      where: { userId },
      create: { userId, adminCoursesView: view },
      update: { adminCoursesView: view },
    });
  },

  async upsertPreferredRole(userId: string, role: string) {
    await prisma.userUiPreference.upsert({
      where: { userId },
      create: { userId, preferredRole: role },
      update: { preferredRole: role },
    });
  },
};
