import { CourseAccessSection } from "./CourseAccessSection";
import { CourseAssignmentsSection } from "./CourseAssignmentsSection";
import { CourseBasicsSection } from "./CourseBasicsSection";
import { CourseFeedbackSection } from "./CourseFeedbackSection";
import { CourseReportsSection } from "./CourseReportsSection";
import { CourseReviewsSection } from "./CourseReviewsSection";
import { CourseStructureSection } from "./CourseStructureSection";
import { CourseSurveySection } from "./CourseSurveySection";
import type { CourseManagementPageModel } from "./_queries/get-course-management-page-model";

export function CourseManagementSectionRenderer({
  section,
}: {
  section: CourseManagementPageModel["section"];
}) {
  switch (section.key) {
    case "structure":
      return <CourseStructureSection {...section.props} />;
    case "basics":
      return <CourseBasicsSection {...section.props} />;
    case "access":
      return <CourseAccessSection {...section.props} />;
    case "assignments":
      return <CourseAssignmentsSection {...section.props} />;
    case "reports":
      return <CourseReportsSection {...section.props} />;
    case "reviews":
      return <CourseReviewsSection {...section.props} />;
    case "feedback":
      return <CourseFeedbackSection {...section.props} />;
    case "survey":
      return <CourseSurveySection {...section.props} />;
  }
}
