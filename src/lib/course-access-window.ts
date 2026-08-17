import {
  mergeEnrollmentExpiry,
  resolveEnrollmentAccess,
} from "@/modules/enrollment/domain/enrollment-access";

export type CourseAccessState = "active" | "expired";

export type CourseAccessWindow = {
  expiresAt: Date | null;
  isUnlimited: boolean;
  isActive: boolean;
  state: CourseAccessState;
};

export function isCourseAssignmentActive(expiresAt: Date | null | undefined, now = new Date()) {
  return !expiresAt || expiresAt.getTime() > now.getTime();
}

export function resolveCourseAccessWindow(
  expiresAtValues: Array<Date | null | undefined>,
  now = new Date()
): CourseAccessWindow | null {
  const candidates = expiresAtValues.filter((value) => value !== undefined);
  const access = resolveEnrollmentAccess({
    directExpiries: candidates,
    groupExpiries: [],
    now,
  });
  if (!access.hasAssignment) return null;

  return {
    expiresAt: access.expiresAt,
    isUnlimited: access.isUnlimited,
    isActive: access.isActive,
    state: access.isActive ? "active" : "expired",
  };
}

export function resolveEffectiveCourseAccessWindow(
  directExpiresAtValues: Array<Date | null | undefined>,
  inheritedExpiresAtValues: Array<Date | null | undefined>,
  now = new Date()
) {
  const access = resolveEnrollmentAccess({
    directExpiries: directExpiresAtValues.filter((value) => value !== undefined),
    groupExpiries: inheritedExpiresAtValues.filter((value) => value !== undefined),
    now,
  });
  if (!access.hasAssignment) return null;
  return {
    expiresAt: access.expiresAt,
    isUnlimited: access.isUnlimited,
    isActive: access.isActive,
    state: access.isActive ? "active" : "expired",
  } satisfies CourseAccessWindow;
}

export function mergeCourseAccessExpiry(
  current: Date | null | undefined,
  incoming: Date | null | undefined
) {
  return mergeEnrollmentExpiry(current, incoming);
}

export function parseCourseAccessDateInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function toCourseAccessDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
