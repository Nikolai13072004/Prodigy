export type CourseManagementSection =
  | "structure"
  | "basics"
  | "access"
  | "assignments"
  | "reports"
  | "reviews"
  | "feedback"
  | "survey";

export type CourseManagementLoadPolicy = {
  assignmentDirectory: boolean;
  broadcastAudience: boolean;
  reportData: boolean;
  manualReviews: boolean;
  feedback: boolean;
  survey: boolean;
};

export function getCourseManagementLoadPolicy(
  section: CourseManagementSection
): CourseManagementLoadPolicy {
  return {
    assignmentDirectory: section === "assignments" || section === "reports",
    broadcastAudience: section === "assignments",
    reportData: section === "reports",
    manualReviews: section === "reviews",
    feedback: section === "feedback",
    survey: section === "survey",
  };
}
