import prisma from "@/lib/prisma";
import { USER_STATUSES } from "@/lib/users";

type AudienceUser = {
  id: string;
  name: string;
  login: string;
  firstName: string;
  email: string | null;
  status: string;
  department: {
    name: string;
  } | null;
};

export type CourseBroadcastAudienceRecipient = {
  id: string;
  name: string;
  login: string;
  firstName: string;
  email: string;
  department: string;
  assignedGroupIds: string[];
  assignedGroupNames: string[];
  assignmentSource: "direct" | "group" | "mixed";
};

export type CourseBroadcastAudienceGroup = {
  id: string;
  name: string;
  eligibleRecipientsCount: number;
};

export type CourseBroadcastAudience = {
  course: {
    id: string;
    title: string;
    status: string;
  };
  recipients: CourseBroadcastAudienceRecipient[];
  groups: CourseBroadcastAudienceGroup[];
  summary: {
    eligibleRecipientsCount: number;
    totalAssignedLearnersCount: number;
    skippedWithoutEmailCount: number;
    skippedInactiveCount: number;
  };
};

export async function getCourseBroadcastAudience(courseId: string): Promise<CourseBroadcastAudience | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      status: true,
      directAssignments: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              login: true,
              firstName: true,
              email: true,
              status: true,
              department: {
                select: { name: true },
              },
            },
          },
        },
      },
      groupAssignments: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              memberships: {
                select: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      login: true,
                      firstName: true,
                      email: true,
                      status: true,
                      department: {
                        select: { name: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!course) return null;

  const allAssignedUserIds = new Set<string>();
  const skippedWithoutEmailIds = new Set<string>();
  const skippedInactiveIds = new Set<string>();
  const recipientsById = new Map<
    string,
    {
      user: AudienceUser;
      hasDirectAssignment: boolean;
      assignedGroups: Map<string, string>;
    }
  >();

  for (const assignment of course.directAssignments) {
    allAssignedUserIds.add(assignment.user.id);
    if (!isEligibleRecipient(assignment.user)) {
      trackIneligibleRecipient(assignment.user, skippedWithoutEmailIds, skippedInactiveIds);
      continue;
    }

    const seed = recipientsById.get(assignment.user.id) ?? {
      user: assignment.user,
      hasDirectAssignment: false,
      assignedGroups: new Map<string, string>(),
    };
    seed.hasDirectAssignment = true;
    recipientsById.set(assignment.user.id, seed);
  }

  for (const assignment of course.groupAssignments) {
    for (const membership of assignment.group.memberships) {
      const user = membership.user;
      allAssignedUserIds.add(user.id);
      if (!isEligibleRecipient(user)) {
        trackIneligibleRecipient(user, skippedWithoutEmailIds, skippedInactiveIds);
        continue;
      }

      const seed = recipientsById.get(user.id) ?? {
        user,
        hasDirectAssignment: false,
        assignedGroups: new Map<string, string>(),
      };
      seed.assignedGroups.set(assignment.group.id, assignment.group.name);
      recipientsById.set(user.id, seed);
    }
  }

  const recipients = Array.from(recipientsById.values())
    .map<CourseBroadcastAudienceRecipient>((seed) => ({
      id: seed.user.id,
      name: seed.user.name,
      login: seed.user.login,
      firstName: seed.user.firstName,
      email: seed.user.email!,
      department: seed.user.department?.name ?? "Без подразделения",
      assignedGroupIds: Array.from(seed.assignedGroups.keys()).sort(),
      assignedGroupNames: Array.from(seed.assignedGroups.values()).sort((left, right) => left.localeCompare(right, "ru")),
      assignmentSource:
        seed.hasDirectAssignment && seed.assignedGroups.size > 0
          ? "mixed"
          : seed.hasDirectAssignment
            ? "direct"
            : "group",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));

  const groups = course.groupAssignments
    .map((assignment) => assignment.group)
    .sort((left, right) => left.name.localeCompare(right.name, "ru"))
    .map((group) => ({
      id: group.id,
      name: group.name,
      eligibleRecipientsCount: recipients.filter((recipient) => recipient.assignedGroupIds.includes(group.id)).length,
    }));

  return {
    course: {
      id: course.id,
      title: course.title,
      status: course.status,
    },
    recipients,
    groups,
    summary: {
      eligibleRecipientsCount: recipients.length,
      totalAssignedLearnersCount: allAssignedUserIds.size,
      skippedWithoutEmailCount: skippedWithoutEmailIds.size,
      skippedInactiveCount: skippedInactiveIds.size,
    },
  };
}

function isEligibleRecipient(user: AudienceUser) {
  return Boolean(user.email) && user.status === USER_STATUSES.ACTIVE;
}

function trackIneligibleRecipient(
  user: AudienceUser,
  skippedWithoutEmailIds: Set<string>,
  skippedInactiveIds: Set<string>
) {
  if (!user.email) skippedWithoutEmailIds.add(user.id);
  if (user.status !== USER_STATUSES.ACTIVE) skippedInactiveIds.add(user.id);
}
