export type CourseAssignmentMode = "ADD" | "REPLACE" | "CLEAR";

export type CourseAssignmentPlan = {
  directUserIds: string[];
  groupIds: string[];
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function planCourseAssignments(args: {
  mode: CourseAssignmentMode;
  currentDirectUserIds: string[];
  currentGroupIds: string[];
  requestedDirectUserIds: string[];
  requestedGroupIds: string[];
}): CourseAssignmentPlan {
  if (args.mode === "CLEAR") {
    return { directUserIds: [], groupIds: [] };
  }

  const requestedDirectUserIds = unique(args.requestedDirectUserIds);
  const requestedGroupIds = unique(args.requestedGroupIds);
  if (args.mode === "REPLACE") {
    return {
      directUserIds: requestedDirectUserIds,
      groupIds: requestedGroupIds,
    };
  }

  return {
    directUserIds: unique([...args.currentDirectUserIds, ...requestedDirectUserIds]),
    groupIds: unique([...args.currentGroupIds, ...requestedGroupIds]),
  };
}
