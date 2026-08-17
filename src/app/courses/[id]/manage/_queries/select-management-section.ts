import type { CourseManagementSection } from "./management-load-policy";

type SectionSelectionOptions = {
  canEditCourse: boolean;
  canOpenAccessSection: boolean;
  canOpenAssignmentsSection: boolean;
  statusSaved?: string;
  statusError?: string;
  assignmentSaved?: string;
  assignmentError?: string;
  assignmentWarning?: string;
  reviewSaved?: string;
  reviewError?: string;
  feedbackSaved?: string;
  feedbackError?: string;
  surveySaved?: string;
  surveyError?: string;
};

export function selectCourseManagementSection(
  requestedSection: string | undefined,
  options: SectionSelectionOptions
): CourseManagementSection {
  if (
    (options.assignmentSaved || options.assignmentError || options.assignmentWarning) &&
    options.canOpenAssignmentsSection
  ) return "assignments";
  if ((options.statusSaved || options.statusError) && options.canOpenAccessSection) return "access";
  if ((options.reviewSaved || options.reviewError) && options.canEditCourse) return "reviews";
  if ((options.feedbackSaved || options.feedbackError) && options.canEditCourse) return "feedback";
  if ((options.surveySaved || options.surveyError) && options.canEditCourse) return "survey";

  const section = isManagementSection(requestedSection) ? requestedSection : null;
  if (section === "assignments" && options.canOpenAssignmentsSection) return section;
  if (section === "access" && options.canOpenAccessSection) return section;
  if (section && section !== "assignments" && section !== "access" && options.canEditCourse) {
    return section;
  }
  if (options.canEditCourse) return "structure";
  if (options.canOpenAccessSection) return "access";
  return "assignments";
}

function isManagementSection(value: string | undefined): value is CourseManagementSection {
  return ["structure", "basics", "access", "assignments", "reports", "reviews", "feedback", "survey"].includes(value ?? "");
}
