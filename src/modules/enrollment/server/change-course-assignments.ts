import "server-only";

import { createChangeCourseAssignments } from "../application/change-course-assignments";
import { prismaEnrollmentMutationRepository } from "../infrastructure/prisma-enrollment-mutation-repository";

export const changeCourseAssignments = createChangeCourseAssignments(
  prismaEnrollmentMutationRepository,
);
