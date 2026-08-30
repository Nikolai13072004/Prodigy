import "server-only";

import { createUnenrollCourseLearner } from "../application/unenroll-course-learner";
import { prismaUnenrollmentRepository } from "../infrastructure/prisma-unenrollment-repository";

export const unenrollCourseLearner = createUnenrollCourseLearner(prismaUnenrollmentRepository);
