import "server-only";

import { createManageCourseSettings } from "../application/manage-course-settings";
import { prismaCourseSettingsRepository } from "../infrastructure/prisma-course-settings-repository";

export const manageCourseSettings = createManageCourseSettings(prismaCourseSettingsRepository);
