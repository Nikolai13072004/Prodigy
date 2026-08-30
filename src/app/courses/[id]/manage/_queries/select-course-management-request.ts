import { getCourseManualReviewStatusParam } from "@/lib/course-manual-reviews";
import { selectCourseManagementSection } from "./select-management-section";

export type CourseManagementSearchParams = Record<string, string | string[] | undefined>;

export type CourseManagementRequestPermissions = {
  canEditCourse: boolean;
  canOpenAccessSection: boolean;
  canOpenAssignmentsSection: boolean;
};

export function selectCourseManagementRequest(
  searchParams: CourseManagementSearchParams,
  permissions: CourseManagementRequestPermissions
) {
  const query = Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [key, firstQueryValue(value)])
  ) as Record<string, string | undefined>;
  const messages = {
    structure: {
      saved: query.structureSaved,
      error: query.structureError,
    },
    access: {
      statusSaved: query.statusSaved,
      statusError: query.statusError,
    },
    assignments: {
      assignmentSaved: query.assignmentSaved,
      assignmentError: query.assignmentError,
      assignmentWarning: query.assignmentWarning,
      messageSaved: query.messageSaved,
      messageError: query.messageError,
    },
    reviews: {
      saved: query.reviewSaved,
      error: query.reviewError,
    },
    feedback: {
      saved: query.feedbackSaved,
      error: query.feedbackError,
    },
    survey: {
      surveySaved: query.surveySaved,
      surveyError: query.surveyError,
    },
  };

  return {
    activeSection: selectCourseManagementSection(query.section, {
      ...permissions,
      ...messages.access,
      ...pickAssignmentRedirectMessages(messages.assignments),
      reviewSaved: messages.reviews.saved,
      reviewError: messages.reviews.error,
      feedbackSaved: messages.feedback.saved,
      feedbackError: messages.feedback.error,
      ...messages.survey,
    }),
    reviewStatusFilter: getCourseManualReviewStatusParam(query.reviewStatus),
    selectedAttemptId: query.attempt,
    structureEditor: {
      selectedItemId: query.editItem,
      selectedModuleId: query.editModule,
    },
    navigation: {
      fromUser: query.fromUser,
      messaging: query.messaging,
      messageError: messages.assignments.messageError,
    },
    messages,
  };
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pickAssignmentRedirectMessages(messages: {
  assignmentSaved?: string;
  assignmentError?: string;
  assignmentWarning?: string;
}) {
  return {
    assignmentSaved: messages.assignmentSaved,
    assignmentError: messages.assignmentError,
    assignmentWarning: messages.assignmentWarning,
  };
}

export type CourseManagementRequest = ReturnType<typeof selectCourseManagementRequest>;
