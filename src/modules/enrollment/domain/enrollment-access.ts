export type EnrollmentAccessSource = "DIRECT" | "GROUP" | null;
export type EnrollmentAccessStatus = "UNASSIGNED" | "ACTIVE" | "EXPIRED";

export type EnrollmentAccess = {
  status: EnrollmentAccessStatus;
  source: EnrollmentAccessSource;
  hasAssignment: boolean;
  isActive: boolean;
  isUnlimited: boolean;
  expiresAt: Date | null;
};

const UNASSIGNED_ACCESS: EnrollmentAccess = {
  status: "UNASSIGNED",
  source: null,
  hasAssignment: false,
  isActive: false,
  isUnlimited: false,
  expiresAt: null,
};

function resolveCandidates(
  values: Array<Date | null>,
  source: Exclude<EnrollmentAccessSource, null>,
  now: Date,
): EnrollmentAccess {
  if (values.some((value) => value === null)) {
    return {
      status: "ACTIVE",
      source,
      hasAssignment: true,
      isActive: true,
      isUnlimited: true,
      expiresAt: null,
    };
  }

  const finiteValues = values.filter((value): value is Date => value instanceof Date);
  const expiresAt = finiteValues.reduce((latest, value) =>
    value.getTime() > latest.getTime() ? value : latest
  );
  const isActive = expiresAt.getTime() > now.getTime();
  return {
    status: isActive ? "ACTIVE" : "EXPIRED",
    source,
    hasAssignment: true,
    isActive,
    isUnlimited: false,
    expiresAt,
  };
}

export function resolveEnrollmentAccess(args: {
  directExpiries: Array<Date | null>;
  groupExpiries: Array<Date | null>;
  now?: Date;
}): EnrollmentAccess {
  const now = args.now ?? new Date();
  if (args.directExpiries.length > 0) {
    return resolveCandidates(args.directExpiries, "DIRECT", now);
  }
  if (args.groupExpiries.length > 0) {
    return resolveCandidates(args.groupExpiries, "GROUP", now);
  }
  return UNASSIGNED_ACCESS;
}

export function mergeEnrollmentExpiry(
  current: Date | null | undefined,
  incoming: Date | null | undefined,
) {
  if (current === undefined) return incoming ?? null;
  if (incoming === undefined) return current ?? null;
  if (current === null || incoming === null) return null;
  return current.getTime() >= incoming.getTime() ? current : incoming;
}
