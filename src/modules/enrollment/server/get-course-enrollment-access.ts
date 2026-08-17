import "server-only";

import { createGetCourseEnrollmentAccess } from "@/modules/enrollment/application/get-course-enrollment-access";
import { prismaEnrollmentAccessRepository } from "@/modules/enrollment/infrastructure/prisma-enrollment-access-repository";

export const getCourseEnrollmentAccess = createGetCourseEnrollmentAccess(
  prismaEnrollmentAccessRepository,
);
