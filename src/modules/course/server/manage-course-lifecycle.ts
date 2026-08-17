import "server-only";

import { createManageCourseLifecycle } from "../application/manage-course-lifecycle";
import { prismaCourseLifecycleRepository } from "../infrastructure/prisma-course-lifecycle-repository";

export const manageCourseLifecycle = createManageCourseLifecycle(prismaCourseLifecycleRepository);
