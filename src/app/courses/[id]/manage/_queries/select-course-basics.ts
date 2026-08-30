import { splitCourseDurationMinutes } from "@/lib/course-metadata";

export function selectCourseBasicsValues(args: {
  tagsJson: string | null;
  durationMinutes: number | null;
}) {
  const duration = splitCourseDurationMinutes(args.durationMinutes);
  const hasDuration = Boolean(
    Number.isInteger(args.durationMinutes) && args.durationMinutes && args.durationMinutes > 0
  );

  return {
    courseTags: parseStringArrayJson(args.tagsJson),
    durationHoursValue: hasDuration ? String(duration.hours) : "",
    durationMinutesValue: hasDuration ? String(duration.minutes) : "",
  };
}

export function parseStringArrayJson(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}
