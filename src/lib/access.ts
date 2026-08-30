import type { Prisma } from "@prisma/client";
import { getCourseEnrollmentAccess } from "@/modules/enrollment/server/get-course-enrollment-access";
import {
  canAccessAllCourses,
  canTrackLearningProgress,
  canTrackMaterialProgress,
  type RoleLike,
  isPlatformAdminRole,
} from "@/lib/roles";

export function canManageCourse(
  role: RoleLike,
  userId: string,
  course: { ownerId: string | null }
) {
  if (isPlatformAdminRole(role)) return true;
  return course.ownerId === userId;
}

export function assignedCourseWhere(userId: string): Prisma.CourseWhereInput {
  const now = new Date();
  const activeAccessWhere = {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } satisfies Prisma.CourseUserAssignmentWhereInput;

  return {
    OR: [
      {
        directAssignments: {
          some: {
            userId,
            ...activeAccessWhere,
          },
        },
      },
      {
        AND: [
          {
            directAssignments: {
              none: {
                userId,
              },
            },
          },
          {
            groupAssignments: {
              some: {
                ...activeAccessWhere,
                group: {
                  memberships: {
                    some: { userId },
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
}

export async function isUserAssignedToCourse(userId: string, courseId: string) {
  const access = await getCourseEnrollmentAccess({ courseId, userId });
  return access.isActive;
}

export async function hasAnyCourseAssignment(userId: string, courseId: string) {
  const access = await getCourseEnrollmentAccess({ courseId, userId });
  return access.hasAssignment;
}

export async function canViewCourseContent(
  userId: string,
  role: RoleLike,
  courseId: string,
  explicitPermissions?: string[] | null
) {
  if (isPlatformAdminRole(role)) return true;
  if (canAccessAllCourses(role, explicitPermissions)) return true;
  if (!canTrackMaterialProgress(role, explicitPermissions)) return false;
  return isUserAssignedToCourse(userId, courseId);
}

export async function canOpenQuizPage(
  userId: string,
  role: RoleLike,
  quiz: { courseItem: { courseId: string; course: { ownerId: string | null } } },
  explicitPermissions?: string[] | null
) {
  if (isPlatformAdminRole(role)) return true;
  if (quiz.courseItem.course.ownerId === userId) return true;
  if (!canTrackLearningProgress(role, explicitPermissions)) return false;
  return isUserAssignedToCourse(userId, quiz.courseItem.courseId);
}

export { getAttemptOutcomeMeta, type AttemptStatusCode } from "@/modules/assessment/domain/attempt-outcome";
