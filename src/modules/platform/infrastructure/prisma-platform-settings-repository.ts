import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";
import type {
  PlatformSettingsRepository,
  PlatformSettingsWrite,
} from "../application/platform-settings-ports";

export const prismaPlatformSettingsRepository: PlatformSettingsRepository = {
  async findAdminCredentials(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, login: true, name: true, passwordHash: true },
    });
    return user ?? null;
  },

  async upsertSettings(fields: PlatformSettingsWrite) {
    await prisma.platformSettings.upsert({
      where: { id: DEFAULT_PLATFORM_SETTINGS.id },
      create: {
        id: DEFAULT_PLATFORM_SETTINGS.id,
        ...fields,
      } as Prisma.PlatformSettingsUncheckedCreateInput,
      update: fields as Prisma.PlatformSettingsUncheckedUpdateInput,
    });
  },
};
