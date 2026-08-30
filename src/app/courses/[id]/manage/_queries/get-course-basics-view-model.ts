import "server-only";

import type { CourseManagementData } from "./get-course-management-data";
import { getCoursePresentationPreviewUrls } from "./get-course-presentation-previews";
import { selectCourseBasicsValues } from "./select-course-basics";

export async function getCourseBasicsViewModel(args: {
  courseId: string;
  course: NonNullable<CourseManagementData["course"]>;
  requestHeaders: Headers;
}) {
  const presentationPreviewUrls = await getCoursePresentationPreviewUrls(args.course.items);
  const coverSourceItem = args.course.items.find((item) => presentationPreviewUrls.get(item.id));

  return {
    ...selectCourseBasicsValues({
      tagsJson: args.course.tagsJson,
      durationMinutes: args.course.durationMinutes,
    }),
    courseViewUrl: buildAbsoluteUrl(args.requestHeaders, `/courses/${args.courseId}`),
    courseCoverSourcePdfUrl: coverSourceItem
      ? presentationPreviewUrls.get(coverSourceItem.id) ?? null
      : null,
    courseCoverSourcePages: coverSourceItem?.totalSlides ?? null,
  };
}

function buildAbsoluteUrl(headersList: Headers, pathname: string) {
  const forwardedHost = headersList.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headersList.get("host") || getConfiguredAppHost();
  const forwardedProto = headersList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return new URL(pathname, `${protocol}://${host}`).toString();
}

function getConfiguredAppHost() {
  try {
    return new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").host;
  } catch {
    return "localhost:3000";
  }
}

export type CourseBasicsViewModel = Awaited<ReturnType<typeof getCourseBasicsViewModel>>;
