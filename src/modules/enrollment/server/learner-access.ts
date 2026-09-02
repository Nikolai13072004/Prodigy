import "server-only";

import { createAssignCourseToLearner } from "../application/assign-course-to-learner";
import { createUpdateCourseLearnerAccess } from "../application/update-course-learner-access";
import { createUpdateCourseLearnersAccessBulk } from "../application/update-course-learners-access-bulk";
import { prismaLearnerAccessRepository } from "../infrastructure/prisma-learner-access-repository";

const deps = { repository: prismaLearnerAccessRepository };

export const assignCourseToLearner = createAssignCourseToLearner(deps);
export const updateCourseLearnerAccess = createUpdateCourseLearnerAccess(deps);
export const updateCourseLearnersAccessBulk =
  createUpdateCourseLearnersAccessBulk(deps);
