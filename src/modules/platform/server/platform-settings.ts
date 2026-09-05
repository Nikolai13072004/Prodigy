import "server-only";

import { prismaPlatformSettingsRepository } from "../infrastructure/prisma-platform-settings-repository";

export const platformSettingsStore = prismaPlatformSettingsRepository;
