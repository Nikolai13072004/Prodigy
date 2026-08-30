import "server-only";

import { headers } from "next/headers";
import type { CourseManagementRequest } from "./select-course-management-request";
import { getCourseBasicsViewModel } from "./get-course-basics-view-model";
import { getCourseManagementData } from "./get-course-management-data";
import { getCourseReportViewModel } from "./get-course-report-view-model";
import { getCourseStructureViewModel } from "./get-course-structure-view-model";
import { selectCourseManagementViewModel } from "./select-course-management-view-model";

type Permissions = {
  canEditCourse: boolean;
  canPublishCourse: boolean;
  canManageAssignments: boolean;
  canOpenAccessSection: boolean;
  canOpenAssignmentsSection: boolean;
};

export async function getCourseManagementPageModel(args: {
  courseId: string;
  request: CourseManagementRequest;
  permissions: Permissions;
}) {
  const data = await getCourseManagementData({
    courseId: args.courseId,
    canEditCourse: args.permissions.canEditCourse,
    activeSection: args.request.activeSection,
    selectedAttemptId: args.request.selectedAttemptId,
    reviewStatusFilter: args.request.reviewStatusFilter,
  });
  if (!data.course) return null;

  const course = data.course;
  const viewModel = selectCourseManagementViewModel({
    courseId: args.courseId,
    course,
    activeSection: args.request.activeSection,
    permissions: args.permissions,
    users: data.allUsers,
    groups: data.allGroups,
    counters: {
      pendingReviewCount: data.pendingReviewCount,
      pendingFeedbackCount: data.pendingFeedbackCount,
      failedEmailCount: data.failedEmailCount,
      feedbackCount: data.feedbackCount,
    },
    navigation: args.request.navigation,
  });

  return {
    activeSection: args.request.activeSection,
    shell: viewModel.shell,
    section: await getActiveSectionModel({ ...args, course, data, viewModel }),
  };
}

async function getActiveSectionModel(args: {
  courseId: string;
  request: CourseManagementRequest;
  permissions: Permissions;
  course: NonNullable<Awaited<ReturnType<typeof getCourseManagementData>>["course"]>;
  data: Awaited<ReturnType<typeof getCourseManagementData>>;
  viewModel: ReturnType<typeof selectCourseManagementViewModel>;
}) {
  const { courseId, course, data, permissions, request, viewModel } = args;

  switch (request.activeSection) {
    case "structure": {
      const structure = await getCourseStructureViewModel({
        courseId,
        course,
        ...request.structureEditor,
      });
      return {
        key: "structure" as const,
        props: {
          courseId,
          course,
          moduleGroups: structure.moduleGroups,
          selectedItem: structure.selectedItem,
          selectedModule: structure.selectedModule,
          selectedItemPreviewHref: structure.selectedItemPreviewHref,
          presentationPreviewUrls: structure.presentationPreviewUrls,
          navigationMode: structure.navigationMode,
          quizGateMode: structure.quizGateMode,
          completionMode: structure.completionMode,
          statusFormat: structure.statusFormat,
          gradedItemIds: structure.gradedItemIds,
          savedMessage: request.messages.structure.saved,
          errorMessage: request.messages.structure.error,
        },
      };
    }
    case "basics": {
      const basics = await getCourseBasicsViewModel({
        courseId,
        course,
        requestHeaders: await headers(),
      });
      return {
        key: "basics" as const,
        props: { courseId, course, ...basics },
      };
    }
    case "access":
      return {
        key: "access" as const,
        props: {
          courseId,
          course,
          canPublishCourse: permissions.canPublishCourse,
          canEditCourse: permissions.canEditCourse,
          messages: request.messages.access,
        },
      };
    case "assignments":
      return {
        key: "assignments" as const,
        props: {
          courseId,
          courseStatus: course.status,
          canManageAssignments: permissions.canManageAssignments,
          canOpenAccessSection: permissions.canOpenAccessSection,
          messagingOpen: viewModel.assignments!.messagingOpen,
          directory: viewModel.assignments!.directory,
          broadcastAudience: data.broadcastAudience,
          messages: request.messages.assignments,
        },
      };
    case "reports": {
      const report = await getCourseReportViewModel({
        courseId,
        course,
        users: data.allUsers,
        attempts: data.reportAttempts,
      });
      return {
        key: "reports" as const,
        props: {
          courseId,
          ...report,
          attempts: data.reportAttempts,
          emailJobs: data.courseEmailJobs,
        },
      };
    }
    case "reviews":
      return {
        key: "reviews" as const,
        props: {
          courseId,
          data: data.manualReviewsData,
          statusFilter: request.reviewStatusFilter,
          messages: request.messages.reviews,
        },
      };
    case "feedback":
      return {
        key: "feedback" as const,
        props: {
          courseId,
          feedbacks: course.feedbacks,
          savedMessage: request.messages.feedback.saved,
          errorMessage: request.messages.feedback.error,
        },
      };
    case "survey":
      return {
        key: "survey" as const,
        props: {
          course,
          reusableSurveyTemplates: data.reusableSurveyTemplates,
          viewModel: viewModel.survey!,
          messages: request.messages.survey,
        },
      };
  }
}

export type CourseManagementPageModel = NonNullable<
  Awaited<ReturnType<typeof getCourseManagementPageModel>>
>;
