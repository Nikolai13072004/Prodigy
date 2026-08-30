import { isCourseAssignmentActive } from "@/lib/course-access-window";

type CourseEnrollmentInput = {
  directAssignments: Array<{ userId: string; expiresAt?: Date | null }>;
  groupAssignments: Array<{
    expiresAt?: Date | null;
    group: {
      memberships: Array<{ userId: string }>;
    };
  }>;
};

export function getUniqueEnrolledLearnersCount(course: CourseEnrollmentInput) {
  const enrolledUserIds = new Set<string>();
  const directAssignedUserIds = new Set<string>();

  for (const assignment of course.directAssignments) {
    directAssignedUserIds.add(assignment.userId);
    if (isCourseAssignmentActive(assignment.expiresAt)) {
      enrolledUserIds.add(assignment.userId);
    }
  }

  for (const assignment of course.groupAssignments) {
    if (!isCourseAssignmentActive(assignment.expiresAt)) continue;
    for (const membership of assignment.group.memberships) {
      if (directAssignedUserIds.has(membership.userId)) continue;
      enrolledUserIds.add(membership.userId);
    }
  }

  return enrolledUserIds.size;
}
