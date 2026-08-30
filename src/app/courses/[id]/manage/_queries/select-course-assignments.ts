export type AssignmentDirectoryUser = {
  id: string;
  name: string | null;
  login: string;
  status: string;
  department: { name: string } | null;
  groupMemberships: Array<{ group: { id: string; name: string } }>;
};

export type CourseAssignmentSnapshot = {
  directAssignments: Array<{ userId: string; assignedAt: Date; expiresAt: Date | null }>;
  groupAssignments: Array<{ groupId: string; assignedAt: Date; expiresAt: Date | null }>;
  invites: Array<{ email: string; accessExpiresAt: Date | null }>;
};

export function selectCourseAssignmentDirectory(args: {
  users: AssignmentDirectoryUser[];
  groups: Array<{ id: string; name: string }>;
  course: CourseAssignmentSnapshot;
}) {
  const selectedUserIds = new Set(args.course.directAssignments.map((item) => item.userId));
  const selectedGroupIds = new Set(args.course.groupAssignments.map((item) => item.groupId));

  return {
    users: args.users.map((user) => ({
      id: user.id,
      name: user.name ?? user.login,
      login: user.login,
      status: user.status,
      department: user.department?.name ?? "Без подразделения",
      groups: user.groupMemberships.map((membership) => membership.group.name),
    })),
    groups: args.groups.map((group) => ({ id: group.id, name: group.name })),
    pendingInviteEmails: args.course.invites.map((invite) => invite.email),
    initiallyAssignedUserIds: Array.from(selectedUserIds),
    initiallyAssignedGroupIds: Array.from(selectedGroupIds),
    accessLabel: selectAssignmentAccessLabel([
      ...args.course.directAssignments.map((item) => item.expiresAt),
      ...args.course.groupAssignments.map((item) => item.expiresAt),
      ...args.course.invites.map((item) => item.accessExpiresAt),
    ]),
  };
}

export function selectAssignedCourseLearners(args: {
  users: AssignmentDirectoryUser[];
  course: Pick<CourseAssignmentSnapshot, "directAssignments" | "groupAssignments">;
}) {
  const selectedUserIds = new Set(args.course.directAssignments.map((item) => item.userId));
  const selectedGroupIds = new Set(args.course.groupAssignments.map((item) => item.groupId));
  const assignmentDatesByUserId = new Map<string, Date[]>();

  for (const assignment of args.course.directAssignments) {
    assignmentDatesByUserId.set(assignment.userId, [
      ...(assignmentDatesByUserId.get(assignment.userId) ?? []),
      assignment.assignedAt,
    ]);
  }
  for (const assignment of args.course.groupAssignments) {
    for (const user of args.users) {
      if (!user.groupMemberships.some((membership) => membership.group.id === assignment.groupId)) continue;
      assignmentDatesByUserId.set(user.id, [
        ...(assignmentDatesByUserId.get(user.id) ?? []),
        assignment.assignedAt,
      ]);
    }
  }

  return args.users
    .filter(
      (user) =>
        selectedUserIds.has(user.id) ||
        user.groupMemberships.some((membership) => selectedGroupIds.has(membership.group.id))
    )
    .map((user) => {
      const assignmentDates = assignmentDatesByUserId.get(user.id) ?? [];
      const assignedAt = assignmentDates.length
        ? new Date(Math.min(...assignmentDates.map((value) => value.getTime())))
        : null;
      const groupSources = user.groupMemberships
        .filter((membership) => selectedGroupIds.has(membership.group.id))
        .map((membership) => membership.group.name)
        .sort((left, right) => left.localeCompare(right, "ru"));

      return {
        id: user.id,
        name: user.name ?? user.login,
        login: user.login,
        department: user.department?.name ?? "Без подразделения",
        assignmentSource: groupSources.join(", ") || "Напрямую",
        assignedAt,
      };
    })
    .sort((left, right) => {
      const dateDifference = (right.assignedAt?.getTime() ?? 0) - (left.assignedAt?.getTime() ?? 0);
      return dateDifference || left.name.localeCompare(right.name, "ru");
    });
}

export function selectAssignmentAccessLabel(values: Array<Date | null | undefined>) {
  const assigned = values.filter((value) => value !== undefined);
  if (assigned.length === 0) return "Не задан";
  const unlimitedCount = assigned.filter((value) => value === null).length;
  if (unlimitedCount === assigned.length) return "Бессрочно";
  const dateLabels = Array.from(
    new Set(
      assigned
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => left.getTime() - right.getTime())
        .map((value) => value.toLocaleDateString("ru-RU"))
    )
  );
  if (unlimitedCount > 0 || dateLabels.length > 1) return "Разные сроки";
  return `До ${dateLabels[0]}`;
}

export type CourseAssignmentDirectory = ReturnType<typeof selectCourseAssignmentDirectory>;
