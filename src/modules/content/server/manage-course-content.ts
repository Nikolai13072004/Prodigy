import "server-only";

import { createManageCourseContent } from "../application/manage-course-content";
import { prismaContentRepository } from "../infrastructure/prisma-content-repository";

export const manageCourseContent = createManageCourseContent(prismaContentRepository);
