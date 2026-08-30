import "server-only";

import { buildCourseModuleGroups } from "@/lib/course-content";
import {
  normalizePresentationViewMode,
  type CourseCompletionMode,
  type CourseNavigationMode,
  type CourseQuizGateMode,
  type CourseStatusFormat,
} from "@/lib/constants";
import type { CourseManagementData } from "./get-course-management-data";
import { getCoursePresentationPreviewUrls } from "./get-course-presentation-previews";
import { parseStringArrayJson } from "./select-course-basics";
import { selectCourseStructureEditor } from "./select-course-structure-editor";

export async function getCourseStructureViewModel(args: {
  courseId: string;
  course: NonNullable<CourseManagementData["course"]>;
  selectedItemId?: string;
  selectedModuleId?: string;
}) {
  const presentationPreviewUrls = await getCoursePresentationPreviewUrls(args.course.items);
  const { selectedItem, selectedModule } = selectCourseStructureEditor({
    items: args.course.items,
    modules: args.course.modules,
    selectedItemId: args.selectedItemId,
    selectedModuleId: args.selectedModuleId,
  });

  return {
    moduleGroups: buildCourseModuleGroups({
      modules: args.course.modules,
      items: args.course.items,
      includeEmptyModules: true,
      uncategorizedTitle: "Без раздела",
    }),
    selectedItem,
    selectedModule,
    selectedItemPreviewHref: selectedItem
      ? getSelectedItemPreviewHref(args.courseId, selectedItem, presentationPreviewUrls)
      : null,
    presentationPreviewUrls,
    navigationMode: (args.course.navigationMode === "SEQUENTIAL" ? "SEQUENTIAL" : "FREE") as CourseNavigationMode,
    quizGateMode: (args.course.quizGateMode === "PASSED" ? "PASSED" : "RESOLVED") as CourseQuizGateMode,
    completionMode: (args.course.completionMode === "REQUIRED_ITEMS" ? "REQUIRED_ITEMS" : "ALL_ITEMS") as CourseCompletionMode,
    statusFormat: (args.course.statusFormat === "PASSED_WITH_SCORE" ? "PASSED_WITH_SCORE" : "COMPLETED_ONLY") as CourseStatusFormat,
    gradedItemIds: parseStringArrayJson(args.course.gradedItemIdsJson),
  };
}

function getSelectedItemPreviewHref(
  courseId: string,
  item: NonNullable<CourseManagementData["course"]>["items"][number],
  presentationPreviewUrls: Map<string, string | null>
) {
  if (item.type === "QUIZ" && item.quiz) {
    return `/courses/${courseId}/quiz/${item.quiz.id}/builder/preview`;
  }
  if (item.type === "SURVEY") {
    return `/courses/${courseId}/survey/${item.id}/builder`;
  }
  if (item.type !== "PDF") {
    return `/courses/${courseId}?item=${item.id}&view=content#lesson-content`;
  }

  return getPresentationItemPreviewHref(
    item.fileUrl,
    item.presentationViewMode,
    presentationPreviewUrls.get(item.id) ?? null
  ) ?? item.fileUrl ?? `/courses/${courseId}?item=${item.id}&view=content#lesson-content`;
}

function getPresentationItemPreviewHref(
  fileUrl: string | null | undefined,
  presentationViewMode: string | null | undefined,
  sourcePdfUrl: string | null
) {
  if (normalizePresentationViewMode(presentationViewMode) === "PPTX_HTML5") {
    return getPptxHtml5PreviewHref(fileUrl) ?? sourcePdfUrl;
  }
  return sourcePdfUrl ?? fileUrl ?? null;
}

function getPptxHtml5PreviewHref(fileUrl: string | null | undefined) {
  if (!fileUrl?.startsWith("/uploads/") || !/\.pptx(?:[?#]|$)/i.test(fileUrl)) return null;
  const cleanUrl = fileUrl.split(/[?#]/, 1)[0] ?? "";
  const fileName = cleanUrl.split("/").pop();
  if (!fileName) return null;
  const baseName = fileName.replace(/\.pptx$/i, "");
  if (!baseName || !/^[a-z0-9_-]+$/i.test(baseName)) return null;
  return `/uploads/pptx-html5/${encodeURIComponent(baseName)}/index.html`;
}

export type CourseStructureViewModel = Awaited<ReturnType<typeof getCourseStructureViewModel>>;
