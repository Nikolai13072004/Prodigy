import "server-only";

import { canViewCourseContent } from "@/lib/access";
import { canTrackMaterialProgress } from "@/lib/roles";
import type { LearningAccessPolicy } from "@/modules/learning/application/ports";

export const learningAccessPolicy: LearningAccessPolicy = {
  async canRecord({ actorId, roles, permissions, courseId }) {
    if (!canTrackMaterialProgress(roles, permissions)) return false;
    return canViewCourseContent(actorId, roles, courseId, permissions);
  },
};
